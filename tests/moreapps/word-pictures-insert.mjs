// !Word's Insert > Picture... in the real desktop (Batch B, B4.2:
// ./PicInsertBox, ./PicLoad): the menu item (between Section break
// and Symbol..., shaded without a selection); one box per document; a
// HostFS PNG path typed and Return: the picture at the caret, one undo
// step, the box gone; a missing path, a directory, an http:// address,
// a text file called .png and a 21 MB file each refused with a message
// and nothing changed; a file icon dropped on the box fills the path;
// typing in the document while a slow read is pending: the "document
// changed" message and nothing put in; the box deleted with its
// document; 20 cycles leak nothing; saved and reopened, the picture is
// drawn. Needs the disc built by tools/disc-wimplib.mjs and
// disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { pngBytes } from './pic-fixtures.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const RED = [220, 20, 30];
const files = {
  Doc: Array.from(await buildDocx({ 'word/document.xml': documentXml([
    p(r('Hello world')), p(r('Second paragraph')),
  ].join('')) })),
  Pic1: Array.from(pngBytes(40, 20, { rgb: RED })),
  Doc2: Array.from(await buildDocx({ 'word/document.xml': documentXml(p(r('Other file'))) })),
  Bmp: Array.from(new Uint8Array([0x42, 0x4d, 0, 0, 0, 0, 0, 0])),
  Fake: Array.from(new TextEncoder().encode('This is only text, not a picture at all.')),
};
const D = 'RAM::RamDisc0.$.';
const O = '￼';

const out = [];
const ok = (name, v, detail) => { out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + String(JSON.stringify(detail)).slice(0, 1200)}`); };
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const { browser, page, logs } = await launch();
const origin = new URL(BASE_URL).origin;
const requests = [];
page.on('request', (q) => { const u = q.url(); if (!u.startsWith(origin) && !/^(data|blob):/.test(u)) requests.push(u); });
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(3));
const press = async (k) => { await page.keyboard.press(k); await settle(); };
const st = () => ev(() => window.__st());
const setPath = (t) => ev((t) => window.__box().set('path', t), t);
/** Wait for a condition in the page (polled), not for a time. */
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 8000, polling: 20 });
const enter = async () => { await press('Enter'); await wait(150); await settle(); };

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  const s0 = await ev(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile('RAM::RamDisc0.$.' + n, new Uint8Array(b), { filetype: /^Doc/.test(n) ? 0xA7E : 0xFF9 });
    os.vfs.mkdir('RAM::RamDisc0.$.Dir');
    os.vfs.writeFile('RAM::RamDisc0.$.Big', new Uint8Array(21 * 1024 * 1024 + 1), { filetype: 0xFF9 });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    // a read held until the test lets it go (no sleeps: the test waits for started / ended)
    window.__hold = () => {
      const orig = os.vfs.readFile.bind(os.vfs);
      window.__orig = os.vfs.readFile;
      let go; const gate = new Promise((res) => { go = res; });
      window.__go = go; window.__started = 0; window.__ended = 0;
      os.vfs.readFile = async (q) => { window.__started++; await gate; try { return await orig(q); } finally { window.__ended++; } };
    };
    window.__unhold = () => { if (window.__orig) { os.vfs.readFile = window.__orig; window.__orig = null; } window.__go?.(); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = () => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === 'Doc');
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    window.__net = 0;
    for (const tgt of [window, document]) {
      const add = tgt.addEventListener.bind(tgt), rem = tgt.removeEventListener.bind(tgt);
      const seen = new Set();
      tgt.addEventListener = (t, f, o) => { const key = [t, f, !!(o === true || o?.capture)].join('|'); if (!seen.has(f + key)) { seen.add(f + key); window.__net++; } return add(t, f, o); };
      tgt.removeEventListener = (t, f, o) => { const key = [t, f, !!(o === true || o?.capture)].join('|'); if (seen.delete(f + key)) window.__net--; return rem(t, f, o); };
    }
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__box = () => {
      const d = window.__doc();
      return d && d.dw.boxes.has('picins') ? window.__word().word.dialog({ key: 'picins:' + d.docKey, rows: [] }) : null;
    };
    window.__item = (name) => {
      const d = window.__doc(), m = d.win.menu({}).items.find((i) => i.text === 'Insert').submenu();
      return m.items.map((i) => i.text).concat([m.items.find((i) => i.text === name)]);
    };
    window.__pics = (d) => {
      const L = d.view.layout, res = [];
      for (const it of L.items) for (const ln of it.lines || []) for (const x of ln.items) {
        if (x.kind !== 'pic') continue;
        const base = it.y + ln.y + ln.base + (x.dy || 0);
        res.push({ x: L.left + x.x, y: base - x.pic.h, w: x.pic.w, h: x.pic.h });
      }
      return res;
    };
    window.__px = (d, x, y) => {
      const w = d.win, cv = w._canvas, k = cv.width / w.w, z = d.view.zoom, t = d.view.layout.top;
      const c = cv.getContext('2d').getImageData(Math.floor((x * z - w.scrollX) * k), Math.floor((t + (y - t) * z - w.scrollY) * k), 1, 1).data;
      return [c[0], c[1], c[2]];
    };
    window.__st = () => {
      const d = window.__doc(), v = d.view, b = window.__box(), w = b?.win, c = os.wimp.caret;
      const doc = d.d.doc;
      return { lines: v.lines().slice(0, 2), depth: v.undoDepth, beeps: window.__beeps, dirty: v.dirty,
        parts: [...doc.parts.keys()].filter((k) => /media/.test(k)), rels: doc.rels.length, msgs: window.__msgs.slice(),
        pics: window.__pics(d).length,
        box: w ? { open: w.isOpen, title: w.title, path: w.iconByName('path').text, msg: w.iconByName('msg').text } : null,
        caret: c?.window === d.win ? 'doc' : c?.window && c.window === w ? 'box:' + c.icon?.name : c?.window ? 'other' : null };
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await os.filer.run('RAM::RamDisc0.$.Doc');
    for (let i = 0; i < 200 && !window.__doc(); i++) await window.__sleep(50);
    const d = window.__doc();
    d.win.open({ x: 40, y: 40, w: 760, h: 400, behind: 'top', scrollX: 0, scrollY: 0 });
    d.dw.view.focus();
    await window.__frames(4);
    return { ok: !!d, msgs: window.__msgs };
  }, files);
  ok('the document opens', s0.ok && !s0.msgs.length, s0);
  const base = await ev(() => ({ windows: os.wimp.windows.size, net: window.__net }));

  // ---------------------------------------------------- the menu item
  const m = await ev(() => { const r = window.__item('Picture...'), it = r.pop(); return { names: r, shaded: !!(typeof it.shaded === 'function' ? it.shaded() : it.shaded) }; });
  const at = m.names.indexOf('Picture...');
  ok('Insert > Picture... sits between Section break and Symbol...', at > 0 && m.names[at - 1] === 'Section break' && m.names[at + 1] === 'Symbol...', m.names);
  ok('... live with a selection', m.shaded === false, m);
  const sh = await ev(() => { const v = window.__doc().dw.view, s = v.sel; v.sel = null; const it = window.__item('Picture...').pop(); const r = typeof it.shaded === 'function' ? it.shaded() : it.shaded; v.sel = s; return !!r; });
  ok('... shaded without a selection', sh === true, sh);

  // ---------------------------------------------------- open: one box per document
  await ev(() => { const d = window.__doc(), L = d.view.layout; d.view.setSelection({ id: L.items[0].id, off: 5 }); d.dw.view.focus(); });
  const open = () => ev(() => { const d = window.__doc(); d.win.menu({}).items.find((i) => i.text === 'Insert').submenu().items.find((i) => i.text === 'Picture...').action(); });
  const d0 = await st();
  await open();
  await settle();
  const o1 = await st();
  const w1 = await ev(() => os.wimp.windows.size);
  await open();
  await settle();
  const w2 = await ev(() => os.wimp.windows.size);
  ok('Picture... opens the Insert picture box, the caret in its path field; asked again it is the same box',
    o1.box?.open && o1.box.title === 'Insert picture' && o1.box.path === '' && o1.caret === 'box:path' && w2 === w1 && w1 === base.windows + 1, [o1.box, o1.caret, w1, w2, base]);

  // ---------------------------------------------------- refusals: a message, nothing changed
  const refuse = async (name, path, re, { dialogMsg = false } = {}) => {
    await setPath(path);
    await enter();
    const s = await st();
    const msg = dialogMsg ? s.msgs.at(-1) : s.box?.msg;
    ok(`${name}: a message, the box kept, nothing changed`,
      re.test(msg || '') && s.box?.open && s.depth === d0.depth && s.lines[0] === d0.lines[0] && s.parts.length === 0 && s.rels === d0.rels
        && s.beeps > d0.beeps && s.dirty === d0.dirty, [msg, s]);
  };
  await refuse('a missing path', D + 'Nowhere', /no such file/i);
  await refuse('a directory', D + 'Dir', /directory/i);
  await refuse('an http:// address', 'http://x/a.png', /address|disc/i);
  await refuse('an empty path', '', /path/i);
  await refuse('a 21 MB file', D + 'Big', /20 MB/);
  await refuse('a text file', D + 'Fake', /not a PNG, JPEG or GIF/, { dialogMsg: true });
  // no media name free (a part named like the media folder): its own message
  await ev(() => { const d = window.__doc().d; window.__partsWas = d.doc.parts; d.doc.parts = new Map(d.doc.parts).set('word/media', new Uint8Array(1)); });
  await setPath(D + 'Pic1');
  await enter();
  const nm = await st();
  await ev(() => { window.__doc().d.doc.parts = window.__partsWas; });
  ok('A4: no picture name free: "No picture name is free", not "cannot take a picture", nothing changed',
    /No picture name is free/.test(nm.msgs.at(-1) || '') && nm.depth === d0.depth && nm.lines[0] === d0.lines[0] && nm.rels === d0.rels, [nm.msgs.at(-1), nm]);
  ok('... no request for the address', requests.length === 0, requests);

  // ---------------------------------------------------- a dropped file icon fills the path
  await setPath('');
  const dr = await ev(() => {
    const b = window.__box(), w = b.win;
    os.wimp.dataLoad({ window: w, x: 10, y: -10, sx: 0, sy: 0 }, [{ path: 'RAM::RamDisc0.$.Pic1', filetype: 0xFF9, size: 10, name: 'Pic1', type: 'file' }]);
    return w.iconByName('path').text;
  });
  ok('a file icon dropped on the box puts its path in the field', dr === D + 'Pic1', dr);

  // ---------------------------------------------------- typed path + Return
  const before = await st();
  await setPath(D + 'Pic1');
  await enter();
  const a = await st();
  ok('Return puts the picture in at the caret: one undo step, a media part and a relationship, the box gone, the caret in the document',
    a.lines[0] === 'Hello' + O + ' world' && a.depth === before.depth + 1 && a.parts.length === 1 && a.rels === before.rels + 1 && a.pics === 1
      && a.box === null && a.caret === 'doc' && a.dirty, a);
  await press('Control+z');
  const u = await st();
  ok('Ctrl-Z takes it all back in one step', u.lines[0] === 'Hello world' && u.depth === before.depth && u.parts.length === 0 && u.rels === before.rels && u.pics === 0, u);

  // ---------------------------------------------------- a slow read and an edit meanwhile
  await open();
  await settle();
  await setPath(D + 'Pic1');
  const m0 = (await st()).msgs.length;
  let sl;
  await ev(() => window.__hold());
  try {
    await enter();
    await until(() => window.__started >= 1);
    await ev(() => { const d = window.__doc(); d.dw.view.input('x'); });
    await ev(() => window.__go());
    await until((n) => window.__msgs.length > n, m0);
    await settle();
    sl = await st();
  } finally {
    await ev(() => window.__unhold());
  }
  ok('typing in the document while the file is being read: the "changed" message, nothing put in',
    sl.msgs.length === m0 + 1 && /document changed while the picture was being read/.test(sl.msgs.at(-1)) && sl.pics === 0 && sl.parts.length === 0
      && sl.lines[0] === 'Hellox world', sl);
  await ev(() => { window.__box()?.win.close?.(); });
  await press('Control+z');

  // ---------------------------------------------------- Escape during a read: nothing goes in, quietly
  await ev(() => { const d = window.__doc(), L = d.view.layout; d.view.setSelection({ id: L.items[0].id, off: 5 }); d.dw.view.focus(); });
  const esc0 = await st();
  await open();
  await settle();
  await setPath(D + 'Pic1');
  let ce;
  await ev(() => window.__hold());
  try {
    await enter();
    await until(() => window.__started >= 1);
    await press('Escape');
    await ev(() => window.__go());
    await until(() => window.__ended >= 1);
    await settle();
    ce = await st();
  } finally {
    await ev(() => window.__unhold());
  }
  ok('Escape while the file is being read: the box goes, nothing is put in, no message, no extra step',
    ce.box === null && ce.pics === 0 && ce.parts.length === 0 && ce.depth === esc0.depth && ce.msgs.length === esc0.msgs.length && ce.lines[0] === esc0.lines[0], [esc0, ce]);

  // ---------------------------------------------------- the box goes with its document; 20 cycles leak nothing
  await ev(() => { const d = window.__doc(), L = d.view.layout; d.view.setSelection({ id: L.items[0].id, off: 5 }); d.dw.view.focus(); });
  const w0 = await ev(() => os.wimp.windows.size);
  for (let i = 0; i < 20; i++) {
    await open();
    await settle();
    await ev(() => { const b = window.__box(); return b.win.isOpen && b.set('path', 'RAM::RamDisc0.$.Pic1'); });
    await press('Escape');
  }
  await settle();
  const lk = await ev(() => ({ windows: os.wimp.windows.size, net: window.__net, boxes: [...window.__doc().dw.boxes.keys()] }));
  ok('20 open / Escape cycles leak no windows or listeners', lk.windows <= w0 && lk.net <= base.net, [lk, w0, base]);
  await open();
  await settle();
  const gone = await ev(async () => { const d = window.__doc(), w = window.__box().win, n = os.wimp.windows.size; d.dw.close(); await window.__sleep(100); return { gone: w.gone === true || !os.wimp.windows.has?.(w), dw: d.dw.boxes.size, left: n - os.wimp.windows.size }; });
  ok('... the box is deleted with its document (it and the window go)', gone.dw === 0 && gone.left >= 2, gone);

  // ---------------------------------------------------- saved and reopened: drawn
  await ev(async () => { await os.filer.run('RAM::RamDisc0.$.Doc'); for (let i = 0; i < 200 && !window.__doc(); i++) await window.__sleep(50); const d = window.__doc(); d.win.open({ x: 40, y: 40, w: 760, h: 400, behind: 'top', scrollX: 0, scrollY: 0 }); d.dw.view.focus(); await window.__frames(3); const L = d.view.layout; d.view.setSelection({ id: L.items[0].id, off: 5 }); });
  await open();
  await settle();
  await setPath(D + 'Pic1');
  await enter();
  await press('Control+s');
  await wait(300);
  await ev(async () => { window.__doc().dw.close(); await window.__sleep(200); await os.filer.run('RAM::RamDisc0.$.Doc'); for (let i = 0; i < 200 && !window.__doc(); i++) await window.__sleep(50); const d = window.__doc(); d.win.open({ x: 40, y: 40, w: 760, h: 400, behind: 'top', scrollX: 0, scrollY: 0 }); await window.__frames(8); });
  await wait(300);
  const px = await ev(async () => { await window.__frames(4); const d = window.__doc(), b = window.__pics(d)[0]; return b ? { n: window.__pics(d).length, c: window.__px(d, b.x + b.w / 2, b.y + b.h / 2), w: b.w, h: b.h } : null; });
  ok('saved and reopened, the picture is drawn in its own colours at its natural size',
    px && px.n === 1 && Math.abs(px.c[0] - RED[0]) < 12 && Math.abs(px.c[1] - RED[1]) < 12 && Math.abs(px.c[2] - RED[2]) < 12 && px.w === 40 && px.h === 20, px);
  ok('no other error reported', (await ev(() => window.__msgs)).length === m0 + 1, await ev(() => window.__msgs));
  // ---------------------------------------------------- B5: drop and paste of image files
  const m1 = (await st()).msgs.length;
  const one = () => ev(() => { const d = window.__doc(), v = d.view; return { lines: v.lines().slice(0, 3), depth: v.undoDepth, pics: window.__pics(d).map((b) => b.w + 'x' + b.h), dirty: v.dirty }; });
  const dropAt = (files) => ev(async (files) => {
    const d = window.__doc(), L = d.view.layout, it = L.items[1];
    os.wimp.dataLoad({ window: d.win, x: L.left + 2, y: it.y + 5, sx: 0, sy: 0 }, files);
    await window.__sleep(300);
    await window.__frames(3);
  }, files);
  const F = (n, t, ft = 0xB60) => ({ path: D + n, filetype: ft, size: 10, name: n, type: t || 'file' });
  const b0 = await one();
  await dropAt([F('Pic1')]);
  const b1 = await one();
  ok('a PNG file icon dropped on the second paragraph goes in there, one undo step; the first paragraph and its picture untouched',
    b1.lines[1] === O + 'Second paragraph' && b1.lines[0] === b0.lines[0] && b1.pics.length === b0.pics.length + 1 && b1.depth === b0.depth + 1 && b1.dirty, [b0, b1]);
  await press('Control+z');
  const b2 = await one();
  ok('... Ctrl-Z takes it back in one step', b2.lines[1] === 'Second paragraph' && b2.depth === b0.depth && b2.pics.length === b0.pics.length, b2);
  // B3 (M8): a window with no selection: the drop point decides
  await ev(() => { window.__doc().dw.view.sel = null; });
  await dropAt([F('Pic1')]);
  const ns = await one();
  ok('B3: a picture dropped on a window with no selection goes in at the drop point, one step',
    ns.lines[1] === O + 'Second paragraph' && ns.depth === b0.depth + 1 && ns.pics.length === b0.pics.length + 1, [b0, ns]);
  await ev(() => window.__doc().dw.view.focus());
  await press('Control+z');
  await dropAt([F('Doc2', 'file', 0xA7E), F('Pic1')]);
  const b3 = await ev(() => ({ doc2: !!window.__word().word.docs.find((d) => !d.closed && d.leaf === 'Doc2'), docs: window.__word().word.docs.filter((d) => !d.closed).length }));
  const b4 = await one();
  ok('a .docx and a PNG dropped together: the document opens and the picture goes in', b3.doc2 && b4.lines[1] === O + 'Second paragraph', [b3, b4]);
  await ev(() => { window.__word().word.docs.find((d) => !d.closed && d.leaf === 'Doc2')?.dw.close(); });
  await ev(() => window.__doc().dw.view.focus());
  await press('Control+z');
  const mj = (await st()).msgs.length, c0 = await one();
  await dropAt([F('Fake', 'file', 0xC85)]);
  const c1 = await one(), cm = (await st()).msgs;
  ok('a JPEG-typed file that holds text: the message, nothing changed',
    cm.length === mj + 1 && /not a PNG, JPEG or GIF/.test(cm.at(-1)) && c1.depth === c0.depth && c1.lines[1] === c0.lines[1] && c1.pics.length === c0.pics.length, [cm.at(-1), c0, c1]);
  await dropAt([F('Nowhere', 'file', 0xB60)]);
  const c2 = await st();
  ok('a PNG-typed file that is gone: the message, nothing changed', c2.msgs.length === mj + 2 && /could not be read/.test(c2.msgs.at(-1)) && (await one()).depth === c0.depth, c2.msgs);

  // size cap, directory, selection, two images, composing
  const dd0 = await one(), dm0 = (await st()).msgs.length, db0 = (await st()).beeps;
  await dropAt([{ ...F('Pic1'), size: 21 * 1024 * 1024 }]);
  const dd1 = await one(), dd1s = await st();
  ok('a PNG file icon over 20 MB: refused before any read, the message, a beep, nothing changed',
    dd1s.msgs.length === dm0 + 1 && /20 MB/.test(dd1s.msgs.at(-1)) && dd1s.beeps === db0 + 1 && dd1.depth === dd0.depth && dd1.pics.length === dd0.pics.length, [dd1s.msgs.at(-1), dd1]);
  await dropAt([F('Dir', 'dir', 0x1000)]);
  const dd2 = await one(), dd2s = await st();
  ok('a directory dropped: nothing happens, no message', dd2.depth === dd0.depth && dd2s.msgs.length === dm0 + 1 && dd2s.beeps === db0 + 1, [dd2, dd2s.msgs.length]);
  const docs0 = await ev(() => window.__word().word.docs.filter((d) => !d.closed).length);
  await dropAt([F('Pic1'), F('Pic1')]);
  const dd3 = await one(), dd3s = await st();
  const docs1 = await ev(() => window.__word().word.docs.filter((d) => !d.closed).length);
  const sel3 = await ev(() => { const q = window.__doc().view.pic(); return q && q.pos; });
  ok('two PNGs in one drop: only the first goes in (one step), the second is not opened as a document, no message',
    dd3.pics.length === dd0.pics.length + 1 && dd3.depth === dd0.depth + 1 && docs1 === docs0 && dd3s.msgs.length === dm0 + 1, [dd3, docs0, docs1, dd3s.msgs.length]);
  ok('... and the picture is what is selected afterwards', sel3 && sel3.off === 0, sel3);
  await press('Control+z');
  const cd = await ev(async (spec) => {
    const d = window.__doc(), h = window.__word().word.docs.find((x) => !x.closed && x.leaf === 'Doc'), L = d.view.layout, it = L.items[1];
    h.view.compose('x');
    const b = window.__beeps, n = window.__pics(d).length;
    os.wimp.dataLoad({ window: d.win, x: L.left + 2, y: it.y + 5, sx: 0, sy: 0 }, [spec]);
    await window.__sleep(300);
    const r = { beeps: window.__beeps - b, same: n === window.__pics(d).length };
    d.dw.view.comp = null;
    return r;
  }, F('Pic1'));
  ok('a picture dropped while an input method is composing: a beep, nothing goes in', cd.beeps === 1 && cd.same, cd);
  
  // paste of a File through the window's paste event
  const pasteFile = (spec) => ev(async ([spec, png]) => {
    const d = window.__doc(), L = d.view.layout;
    d.view.setSelection({ id: L.items[1].id, off: 6 });
    const h = window.__word().word.docs.find((x) => !x.closed && x.leaf === 'Doc');
    const f = new File([new Uint8Array(spec.big ? 21 * 1024 * 1024 + 1 : spec.png ? png : spec.bytes)], spec.name, { type: spec.type });
    if (spec.slow) { const a = f.arrayBuffer.bind(f); f.arrayBuffer = async () => { await window.__sleep(spec.slow); return a(); }; }
    const r = h.paste({ files: [f] });
    if (spec.close) { await window.__sleep(50); d.dw.close(); }
    await window.__sleep(spec.slow ? spec.slow + 300 : 300);
    await window.__frames(3);
    return { r, last: h.clipboard.last };
  }, [spec, files.Pic1]);
  const p0 = await one();
  const pr = await pasteFile({ png: true, name: 'a.png', type: 'image/png' });
  const p1 = await one();
  ok('a pasted PNG File goes in at the caret: one undo step, clipboard.last is picture',
    pr.last === 'picture' && p1.lines[1] === 'Second' + O + ' paragraph' && p1.depth === p0.depth + 1 && p1.pics.length === p0.pics.length + 1, [pr, p0, p1]);
  await press('Control+z');
  const pm = (await st()).msgs.length;
  const bm = await pasteFile({ bytes: files.Bmp, name: 'a.bmp', type: 'image/bmp' });
  const p2 = await one(), pms = (await st()).msgs;
  ok('a pasted BMP File: the message "Only PNG, JPEG and GIF...", nothing changed',
    bm.last === 'files' && pms.length === pm + 1 && /^Only PNG, JPEG and GIF pictures can be pasted/.test(pms.at(-1)) && p2.depth === p0.depth && p2.lines[1] === p0.lines[1], [bm, pms.at(-1), p2]);
  const pb = (await st()).msgs.length, pb0 = await one();
  const bg = await pasteFile({ big: true, name: 'big.png', type: 'image/png' });
  const pb1 = await one(), pbm = (await st()).msgs;
  ok('a pasted PNG over 20 MB: the message "too large", nothing changed',
    pbm.length === pb + 1 && /too large: at most 20 MB/.test(pbm.at(-1)) && pb1.depth === pb0.depth && pb1.pics.length === pb0.pics.length, [bg, pbm.at(-1), pb1]);
  const pf = await pasteFile({ bytes: files.Fake, name: 'a.png', type: 'image/png' });
  const pf1 = await one(), pfm = (await st()).msgs;
  ok('a pasted PNG-typed File holding text: the "not a PNG, JPEG or GIF" message, nothing changed',
    pfm.length === pb + 2 && /not a PNG, JPEG or GIF/.test(pfm.at(-1)) && pf1.depth === pb0.depth && pf.last === 'picture', [pf, pfm.at(-1), pf1]);
  const pc = await ev(async (png) => {
    const d = window.__doc(), h = window.__word().word.docs.find((x) => !x.closed && x.leaf === 'Doc');
    h.view.compose('x');
    const b = window.__beeps, n = window.__pics(d).length;
    h.paste({ files: [new File([new Uint8Array(png)], 'a.png', { type: 'image/png' })] });
    await window.__sleep(300);
    const r = { last: h.clipboard.last, beeps: window.__beeps - b, same: n === window.__pics(d).length };
    h.view.flush();
    return r;
  }, files.Pic1);
  ok('a paste while composing is refused with a beep as before', pc.last === 'composing' && pc.beeps === 1 && pc.same, pc);
  await press('Control+z');
  await ev(() => { window.__sleep(50); });
  const pn = await ev(() => window.__msgs.length);
  await pasteFile({ png: true, name: 'a.png', type: 'image/png', slow: 300, close: true });
  const pe = await ev(() => ({ docs: window.__word().word.docs.filter((d) => !d.closed && d.leaf === 'Doc').length }));
  const pm2 = await ev(() => window.__msgs.length);
  ok('the window closed before the read ends: nothing goes in, no error, no message', pe.docs === 0 && !logs.length && pm2 === pn, [pe, logs.length, pn, pm2]);
  ok('no request for any address', requests.length === 0, requests);
  void m1;
  // ---------------------------------------------------- the document closed during a read: silent
  await ev(async () => { await os.filer.run('RAM::RamDisc0.$.Doc'); for (let i = 0; i < 200 && !window.__doc(); i++) await window.__sleep(50); const d = window.__doc(); d.win.open({ x: 40, y: 40, w: 760, h: 400, behind: 'top', scrollX: 0, scrollY: 0 }); await window.__frames(4); });
  await ev(() => { const d = window.__doc(), L = d.view.layout; d.view.setSelection({ id: L.items[0].id, off: 2 }); d.dw.view.focus(); });
  await open();
  await settle();
  await setPath(D + 'Pic1');
  const n0 = (await st()).msgs.length, bp = (await st()).beeps;
  let cl;
  await ev(() => window.__hold());
  try {
    await enter();
    await until(() => window.__started >= 1);
    await ev(() => { window.__doc().dw.close(); });
    await ev(() => window.__go());
    await until(() => window.__ended >= 1);
    await settle();
    cl = await ev(() => ({ msgs: window.__msgs.length, beeps: window.__beeps, open: !!window.__doc() }));
  } finally {
    await ev(() => window.__unhold());
  }
  ok('a document closed while its picture is being read: no message, no beep', cl.msgs === n0 && cl.beeps === bp && !cl.open, [cl, n0, bp]);
} catch (e) {
  out.push('FAIL exception ' + (e.stack || e));
} finally {
  if (logs?.length) out.push('LOGS ' + JSON.stringify(logs).slice(0, 600));
  await browser.close();
  console.log(out.join('\n'));
  process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
}
