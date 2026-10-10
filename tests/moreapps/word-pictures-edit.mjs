// !Word's pictures selected, resized and deleted in the real desktop
// (Batch B, B3.2: ./PicDrag), with a real mouse and real keys: a click
// on a picture selects it (its eight handles drawn black), Shift-Right
// from before it selects it, Delete and Backspace remove it (one undo
// gives it back); the SE handle dragged keeps the proportions, the e
// handle changes the width only, Shift frees a corner; Escape during a
// drag ends it (ghost gone, nothing changed, no undo step); a floating
// picture's handle beeps; Ctrl-Z after a resize gives back the old size
// with the picture selected; at 50% and 200% the drawn handle is the
// one that resizes; a double-click calls view.onPicture; 30 select /
// resize / undo cycles leak no listeners, windows or elements; a drag
// back to its start changes nothing; Delete or Ctrl-Z during a drag ends
// it with a beep; a picture wider than the column resizes in proportion
// to its file extent; the smallest and largest sizes keep the ratio.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { picDocx, pngBytes } from './pic-fixtures.mjs';
import { p, r } from './build-docx.mjs';

const RED = [220, 20, 30];
const files = {
  Ed: Array.from(await picDocx({
    pics: [
      { bytes: pngBytes(40, 20, { rgb: RED }), cx: 1828800, cy: 914400 },   // 2 in x 1 in: 192 x 96 px
      { bytes: pngBytes(8, 8, { rgb: RED }), kind: 'anchor', cx: 914400, cy: 457200 },
    ],
    body: p(r('The end of the document.')),
  })),
  // wider than the column (shown scaled down) and near the 22 in limit
  Wide: Array.from(await picDocx({
    pics: [
      { bytes: pngBytes(40, 20, { rgb: RED }), cx: 10972800, cy: 5486400 },   // 12 in x 6 in
      { bytes: pngBytes(40, 4, { rgb: RED }), cx: 18288000, cy: 1828800 },    // 20 in x 2 in
    ],
    body: p(r('The end.')),
  })),
};
const MAX_EMU = 20116800, MIN_EMU = 9525;

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(3));
const press = async (k) => { await page.keyboard.press(k); await settle(); };
const st = () => ev(() => window.__st());
/** Client point of handle `name` of the selected picture (+ dx, dy). */
const handle = (name) => ev((n) => window.__handle(n), name);
const centre = (i) => ev((i) => window.__centre(i), i);
const click = async (q) => { await page.mouse.click(q.x, q.y); await wait(40); await settle(); };
/** A real drag from a by dx, dy (client px); mid(): run before the release. */
async function drag(a, dx, dy, { shift = false, mid } = {}) {
  await wait(450);                     // (not a double-click)
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + dx / 2, a.y + dy / 2, { steps: 4 });
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(a.x + dx, a.y + dy, { steps: 4 });
  await settle();
  const r = mid ? await mid() : null;
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await wait(40);
  await settle();
  return r;
}
/** The width a corner drag by dx, dy gives a w x h box (PicSize: the larger relative change leads). */
const along = (w, h, dx, dy) => { const kw = (w + dx) / w, kh = (h + dy) / h; return w * (Math.abs(kw - 1) >= Math.abs(kh - 1) ? kw : kh); };
const ratioOk = (s, cx, cy) => Math.abs(s.cx - s.cy * cx / cy) <= 1 && Math.abs(s.cy - s.cx * cy / cx) <= 1;

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  const s0 = await ev(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [k, v] of Object.entries(files)) os.vfs.writeFile('RAM::RamDisc0.$.' + k, new Uint8Array(v), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__name = 'Ed';
    window.__doc = () => window.__word()?.word.docs.find((d) => d.path?.endsWith('.' + window.__name));
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    // net listeners added to window and document (a leak check)
    window.__net = 0;
    for (const tgt of [window, document]) {
      const add = tgt.addEventListener.bind(tgt), rem = tgt.removeEventListener.bind(tgt);
      const seen = new Set();
      tgt.addEventListener = (t, f, o) => { const k = [t, f, !!(o === true || o?.capture)]; const key = k.join('|');
        if (!seen.has(f + key)) { seen.add(f + key); window.__net++; } return add(t, f, o); };
      tgt.removeEventListener = (t, f, o) => { const key = [t, f, !!(o === true || o?.capture)].join('|');
        if (seen.delete(f + key)) window.__net--; return rem(t, f, o); };
    }
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    /** Work-area point of layout point x, y. */
    window.__work = (d, x, y) => { const z = d.view.zoom, t = d.view.layout.top; return { x: x * z, y: t + (y - t) * z }; };
    window.__at = (d, x, y) => { const q = window.__work(d, x, y); return window.__client(d.win, q.x, q.y); };
    /** The pictures' boxes (layout px), in order. */
    window.__pics = (d) => {
      const L = d.view.layout, res = [];
      for (const it of L.items) for (const ln of it.lines || []) for (const x of ln.items) {
        if (x.kind !== 'pic') continue;
        const base = it.y + ln.y + ln.base + (x.dy || 0);
        res.push({ x: L.left + x.x, y: base - x.pic.h, w: x.pic.w, h: x.pic.h });
      }
      return res;
    };
    window.__centre = (i) => { const d = window.__doc(), b = window.__pics(d)[i]; return window.__at(d, b.x + b.w / 2, b.y + b.h / 2); };
    window.__handle = (n) => {
      const d = window.__doc(), q = d.view.pic(), h = q.handles.find((x) => x.name === n);
      return window.__at(d, h.x + h.w / 2, h.y + h.h / 2);
    };
    /** Canvas pixel [r, g, b] at layout point x, y. */
    window.__px = (d, x, y) => {
      const w = d.win, cv = w._canvas, k = cv.width / w.w, q = window.__work(d, x, y);
      const c = cv.getContext('2d').getImageData(Math.floor((q.x - w.scrollX) * k), Math.floor((q.y - w.scrollY) * k), 1, 1).data;
      return [c[0], c[1], c[2]];
    };
    window.__st = () => {
      const d = window.__doc(), v = d.view, q = v.pic(), b0 = d.d.doc.sections[0].blocks[0];
      return { depth: v.undoDepth, beeps: window.__beeps, lines: v.lines(), dirty: v.dirty,
        pic: q && { off: q.pos.off, index: v.layout.byId.get(q.pos.id).index, cx: q.cx, cy: q.cy, floating: q.floating,
          rect: q.rect, handles: q.handles },
        ghost: d.dw.view.picGhost ?? null, dragging: !!d.dw.view.picDrag,
        node0: b0.inlines?.[0]?.node === window.__node0, msgs: window.__msgs };
    };
    await os.filer.run('RAM::RamDisc0.$.Ed');
    for (let i = 0; i < 200 && !window.__doc(); i++) await window.__sleep(50);
    const d = window.__doc();
    d.win.open({ x: 60, y: 40, w: 860, h: 800, behind: 'top', scrollX: 0, scrollY: 0 });
    d.dw.view.focus();
    d.dw.view.onPicture = () => {};     // (a double-click opens the Picture box: word-picbox.mjs)
    await window.__frames(4);
    return { ok: !!d, n: window.__pics(d).length, msgs: window.__msgs };
  }, files);
  ok('the document opens with two pictures', s0.ok && s0.n === 2 && !s0.msgs.length, s0);

  // ---------------------------------------------------- a click selects
  await click(await centre(0));
  const a1 = await st();
  const black = await ev(() => {
    const d = window.__doc(), q = d.view.pic();
    return q ? q.handles.map((h) => window.__px(d, h.x + h.w / 2, h.y + h.h / 2)) : null;
  });
  ok('a click on a picture selects it', a1.pic && a1.pic.index === 0 && a1.pic.off === 0 && a1.pic.cx === 1828800, a1);
  ok('its eight handles are drawn black', black && black.length === 8 && black.every((c) => c[0] < 40 && c[1] < 40 && c[2] < 40), black);
  // a click in the text: the handles go
  await click(await ev(() => { const d = window.__doc(), L = d.view.layout, c = L.caretRect({ id: L.items[2].id, off: 3 }); return window.__at(d, c.x + 1, c.y + c.h / 2); }));
  const a2 = await st();
  const white = await ev(() => { const d = window.__doc(), b = window.__pics(d)[0]; return window.__px(d, b.x + b.w, b.y + b.h); });
  ok('a click in the text: nothing selected, no handles', a2.pic === null && white[0] > 150, [a2.pic, white]);

  // ---------------------------------------------------- Shift-Right, Delete, Backspace
  await ev(() => { const d = window.__doc(), L = d.view.layout; d.view.setSelection({ id: L.items[0].id, off: 0 }); d.dw.view.focus(); });
  await press('Shift+ArrowRight');
  const b1 = await st();
  ok('Shift-Right from before a picture selects it', b1.pic && b1.pic.index === 0, b1);
  await press('Delete');
  const b2 = await st();
  await press('Control+z');
  const b3 = await st();
  ok('Delete removes it; one undo gives it back, selected', b2.lines[0] === '' && b2.depth === b1.depth + 1 && b2.pic === null
    && b3.lines[0] === '\uFFFC' && b3.depth === b1.depth && b3.pic && b3.pic.index === 0, [b2, b3]);
  await click(await centre(0));
  await press('Backspace');
  const b4 = await st();
  await press('Control+z');
  const b5 = await st();
  ok('Backspace removes it; one undo gives it back', b4.lines[0] === '' && b5.lines[0] === '\uFFFC' && b5.depth === b1.depth, [b4, b5]);

  // ---------------------------------------------------- SE: proportions kept
  await click(await centre(0));
  const c0 = await st();
  await drag(await handle('se'), 50, 50);
  const c1 = await st();
  ok('the SE handle dragged 50 px right and down: one undo step, the proportions kept within 1 EMU',
    c1.pic && c1.depth === c0.depth + 1 && c1.pic.cx > 1828800 && ratioOk(c1.pic, 1828800, 914400) && c1.ghost === null, c1);
  ok('... the corner follows the pointer along the leading axis', c1.pic && Math.abs(c1.pic.rect.w - along(192, 96, 50, 50)) <= 2, [c0.pic, c1.pic]);
  await press('Control+z');
  const c2 = await st();
  ok('Ctrl-Z gives back the old size, the picture selected', c2.pic && c2.pic.cx === 1828800 && c2.pic.cy === 914400
    && c2.depth === c0.depth, c2);

  // ---------------------------------------------------- e: width only
  await drag(await handle('e'), 40, 30);
  const e1 = await st();
  ok('the e handle changes the width only', e1.pic && e1.pic.cy === 914400 && Math.abs(e1.pic.cx - 1828800 - 40 * 9525) <= 9525
    && e1.depth === c0.depth + 1, e1);
  await press('Control+z');

  // ---------------------------------------------------- Shift frees a corner
  await drag(await handle('se'), 60, 6, { shift: true });
  const f1 = await st();
  ok('Shift + the SE handle: both sides follow the pointer', f1.pic && Math.abs(f1.pic.cx - (192 + 60) * 9525) <= 9525
    && Math.abs(f1.pic.cy - (96 + 6) * 9525) <= 9525 && !ratioOk(f1.pic, 1828800, 914400), f1);
  await press('Control+z');

  // ---------------------------------------------------- Escape during a drag
  const g0 = await st();
  await ev(() => { window.__node0 = window.__doc().d.doc.sections[0].blocks[0].inlines[0].node; });
  const mid = await drag(await handle('se'), 70, 40, { mid: async () => {
    const before = await st();
    await page.keyboard.press('Escape');
    await settle();
    const after = await st();
    await page.mouse.move(700, 500, { steps: 3 });
    return { before, after };
  } });
  const g1 = await st();
  ok('during a drag a ghost is drawn', mid.before.ghost && mid.before.dragging && Math.abs(mid.before.ghost.w - along(192, 96, 70, 40)) <= 2, mid.before);
  ok('Escape ends it: the ghost gone', mid.after.ghost === null && !mid.after.dragging, mid.after);
  ok('... and nothing changed: the same node, no undo step, the picture still selected', g1.node0 && g1.depth === g0.depth
    && g1.pic && g1.pic.cx === 1828800 && g1.ghost === null, g1);

  // ---------------------------------------------------- floating: a beep
  await click(await centre(1));
  const h0 = await st();
  await ev(() => { window.__node1 = window.__doc().d.doc.sections[0].blocks[1].inlines[0].node; });
  await drag(await handle('se'), 40, 40);
  const h1 = await st();
  const same1 = await ev(() => window.__doc().d.doc.sections[0].blocks[1].inlines[0].node === window.__node1);
  ok('a floating picture is selected by a click', h0.pic && h0.pic.index === 1 && h0.pic.floating, h0);
  ok('a drag on its handle beeps and changes nothing', h1.beeps === h0.beeps + 1 && h1.depth === h0.depth && same1
    && h1.ghost === null && h1.pic && h1.pic.index === 1, h1);

  // ---------------------------------------------------- zoom
  for (const Z of [50, 200]) {
    await ev(async (z) => { const d = window.__doc(); d.setZoom(z); await window.__frames(3); d.win.scrollTo(0, 0); await window.__frames(3); }, Z);
    await click(await centre(0));
    const z0 = await st();
    await drag(await handle('se'), 40, 40);
    const z1 = await st();
    ok(`at ${Z}% the drawn SE handle resizes (40 screen px = ${40 * 100 / Z} layout px)`, z0.pic && z1.pic
      && z1.depth === z0.depth + 1 && Math.abs(z1.pic.rect.w - along(192, 96, 4000 / Z, 4000 / Z)) <= 3 && ratioOk(z1.pic, 1828800, 914400), [z0.pic, z1.pic]);
    await press('Control+z');
  }
  await ev(async () => { const d = window.__doc(); d.setZoom(100); await window.__frames(3); d.win.scrollTo(0, 0); await window.__frames(3); });

  // ---------------------------------------------------- double-click
  await ev(() => { const d = window.__doc(); window.__picCalls = 0; d.dw.view.onPicture = () => { window.__picCalls++; }; d.view.setSelection({ id: d.view.layout.items[2].id, off: 0 }); });
  await wait(450);
  const q = await centre(0);
  await page.mouse.dblclick(q.x, q.y);
  await wait(40);
  await settle();
  const k1 = await st();
  const calls = await ev(() => window.__picCalls);
  ok('a double-click on a picture selects it and calls onPicture', calls === 1 && k1.pic && k1.pic.index === 0, [calls, k1.pic]);

  // ---------------------------------------------------- back where it began: nothing
  await click(await centre(0));
  const r0 = await st();
  await ev(() => { window.__node0 = window.__doc().d.doc.sections[0].blocks[0].inlines[0].node; });
  {
    const a = await handle('se');
    await wait(450);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 40, a.y + 40, { steps: 4 });
    await page.mouse.move(a.x, a.y, { steps: 4 });
    await page.mouse.up();
    await wait(40);
    await settle();
  }
  const r1 = await st();
  ok('a drag that comes back where it began: no change, no step, no *', r1.node0 && r1.depth === r0.depth && !r1.dirty
    && r1.ghost === null && r1.beeps === r0.beeps && r1.pic, [r0.depth, r1]);

  // ---------------------------------------------------- the smallest size keeps the ratio
  await drag(await handle('se'), -400, -400);
  const m1 = await st();
  ok('dragged down to nothing: the smallest size, the ratio kept', m1.pic && m1.pic.cy === MIN_EMU && m1.pic.cx === 2 * MIN_EMU
    && m1.depth === r0.depth + 1, m1.pic);
  await press('Control+z');

  // ---------------------------------------------------- the document changing during a drag
  const x0 = await st();
  await drag(await handle('se'), 60, 30, { mid: async () => { await page.keyboard.press('Delete'); await settle(); } });
  const x1 = await st();
  await page.keyboard.type('xy');
  await settle();
  const x2 = await st();
  ok('Delete during a drag: the picture deleted, the drag ended with a beep, nothing resized', x1.lines[0] === ''
    && x1.beeps === x0.beeps + 1 && x1.depth === x0.depth + 1 && x1.ghost === null && !x1.dragging, x1);
  ok('... and typing then goes in', x2.lines[0] === 'xy', x2.lines);
  for (let i = 0; i < 4 && (await st()).lines[0] !== '\uFFFC'; i++) await press('Control+z');
  const x3 = await st();
  ok('... undo gives the picture back, selected', x3.lines[0] === '\uFFFC' && x3.depth === x0.depth && x3.pic && x3.pic.cx === 1828800, x3);
  await drag(await handle('se'), 50, 50);
  const y0 = await st();
  await drag(await handle('e'), 40, 0, { mid: async () => { await page.keyboard.press('Control+z'); await settle(); } });
  const y1 = await st();
  const redo = await ev(() => window.__doc().d.canRedo);
  ok('Ctrl-Z during a drag: undone, the drag ended with a beep, the redo kept', y0.depth === x0.depth + 1
    && y1.depth === x0.depth && y1.pic && y1.pic.cx === 1828800 && y1.pic.cy === 914400 && y1.beeps === y0.beeps + 1 && redo, [y0.pic, y1]);

  // ---------------------------------------------------- 30 cycles
  const count = () => ev(() => ({ net: window.__net, windows: os.wimp.windows.size, tw: window.__word().windows.size,
    dom: document.querySelectorAll('*').length }));
  await wait(450);
  const n0 = await count(), l0 = await st();
  for (let i = 0; i < 30; i++) {
    await click(await centre(0));
    await drag(await handle(i % 2 ? 'se' : 'e'), 20 + (i % 5), 10);
    await press('Control+z');
  }
  const n1 = await count(), l1 = await st();
  ok('30 select / resize / undo cycles: the document as it was', l1.depth === l0.depth && l1.pic && l1.pic.cx === 1828800
    && l1.pic.cy === 914400 && !l1.msgs.length, l1);
  ok('... and no listener, window or element left behind', n1.net === n0.net && n1.windows === n0.windows && n1.tw === n0.tw
    && Math.abs(n1.dom - n0.dom) <= 5, [n0, n1]);

  // ---------------------------------------------------- wider than the column
  await ev(async () => {
    window.__name = 'Wide';
    await os.filer.run('RAM::RamDisc0.$.Wide');
    for (let i = 0; i < 200 && !window.__doc(); i++) await window.__sleep(50);
    const d = window.__doc();
    d.win.open({ x: 80, y: 40, w: 860, h: 800, behind: 'top', scrollX: 0, scrollY: 0 });
    d.dw.view.focus();
    d.dw.view.onPicture = () => {};
    await window.__frames(4);
  });
  await wait(450);
  await click(await centre(0));
  const w0 = await st();
  const W = w0.pic.rect.w, H = w0.pic.rect.h;
  await drag(await handle('e'), -100, 0);
  const w1 = await st();
  const per = 10972800 / W;                    // EMU per shown px
  ok('a picture wider than the column is shown scaled down', W < 1152 && Math.abs(W / H - 2) < 0.02, w0.pic);
  ok('... its e handle scales the width as the box changes, the height kept', w1.pic && w1.pic.cy === 5486400
    && Math.abs(w1.pic.cx - 10972800 * (W - 100) / W) <= per && w1.depth === w0.depth + 1, [W, w1.pic]);
  await press('Control+z');
  await drag(await handle('se'), -100, -50);
  const w2 = await st();
  ok('... a corner keeps its proportions (within 1 EMU), scaled as the box', w2.pic && ratioOk(w2.pic, 10972800, 5486400)
    && Math.abs(w2.pic.cx - 10972800 * (W - 100) / W) <= 2 * per, [W, w2.pic]);
  await press('Control+z');
  await wait(450);
  await click(await centre(1));
  const v0 = await st();
  await drag(await handle('se'), 100, 10);
  const v1 = await st();
  ok('at the largest size both sides stop together: the ratio kept', v0.pic && v0.pic.index === 1 && v1.pic
    && v1.pic.cx === MAX_EMU && v1.pic.cy === MAX_EMU / 10 && v1.depth === v0.depth + 1, [v0.pic, v1.pic]);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
