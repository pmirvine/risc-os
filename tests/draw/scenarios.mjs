// Draw test scenarios (each returns an optional screenshot clip)
const sleep = (p, ms) => p.waitForTimeout(ms);

export async function start(page) {
  await page.evaluate(() => window.os.apps.start('Draw'));
  await sleep(page, 800);
  // click the Draw icon on the icon bar
  const n = await page.evaluate(() => { const d = globalThis.__draw; d.newDiagram(); return d.diagrams.length; });
  await sleep(page, 800);
}

/** work-area point of draw coords in the first view -> page coords */
export async function toPage(page, x, y, vi = 0) {
  return page.evaluate(([x, y, vi]) => {
    const d = globalThis.__draw.diagrams.at(-1);
    const v = d.views[vi];
    const w = v.toWork(x, y);
    const s = v.win.workToScreen(w.x, w.y);
    const r = document.querySelector('#screen, .screen, body').getBoundingClientRect();
    const scale = window.wimp?.scale ?? 1;
    const sr = window.wimp.screen.getBoundingClientRect();
    return { x: sr.left + s.x * scale, y: sr.top + s.y * scale };
  }, [x, y, vi]);
}

export async function empty(page) { await start(page); }

async function clickDraw(page, x, y, opts = {}) { const p = await toPage(page, x, y); const mods = opts.modifiers ?? []; for (const m of mods) await page.keyboard.down(m); await page.mouse.click(p.x, p.y, { button: opts.button }); for (const m of mods) await page.keyboard.up(m); await sleep(page, 60); }
async function moveDraw(page, x, y) { const p = await toPage(page, x, y); await page.mouse.move(p.x, p.y, { steps: 3 }); await sleep(page, 40); }
const IN = 46080, CM = 18144;
async function pane(page, i) {
  const b = await page.evaluate((i) => { const d = globalThis.__draw.diagrams.at(-1); const p = d.views[0].pane; const ic = p.icons[i]; const s = p.workToScreen((ic.bbox.x0 + ic.bbox.x1) / 2, (ic.bbox.y0 + ic.bbox.y1) / 2); const sr = window.wimp.screen.getBoundingClientRect(); return { x: sr.left + s.x, y: sr.top + s.y }; }, i);
  await page.mouse.click(b.x, b.y); await sleep(page, 100);
}
async function winClip(page, pad = 40) {
  return page.evaluate((pad) => { const d = globalThis.__draw.diagrams.at(-1); const w = d.views[0].win; const o = w.outline(); return { x: Math.max(0, o.x0 - pad), y: Math.max(0, o.y0 - 10), width: o.x1 - o.x0 + pad + 10, height: o.y1 - o.y0 + 20 }; }, pad);
}
async function bigWindow(page) {
  await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); const w = d.views[0].win; w.open({ x: 60, y: 40, w: 800, h: 640, scrollX: 0, scrollY: w.extent.y1 - 640 }); });
  await sleep(page, 200);
}

export async function shapes(page) {
  await start(page);
  await bigWindow(page);
  // closed line (default mode): a triangle
  await clickDraw(page, 1 * IN, 3 * IN); await moveDraw(page, 2 * IN, 4.5 * IN);
  await clickDraw(page, 2 * IN, 4.5 * IN); await moveDraw(page, 3 * IN, 3 * IN);
  await (async () => { const p = await toPage(page, 3 * IN, 3 * IN); await page.mouse.dblclick(p.x, p.y); })();
  await sleep(page, 200);
  // curve (open)
  await pane(page, 2);
  for (const [x, y] of [[4, 3], [5, 4.5], [6, 3], [7, 4.5]]) { await moveDraw(page, x * IN, y * IN); await clickDraw(page, x * IN, y * IN); }
  await page.keyboard.press('Enter'); await sleep(page, 100);
  // rectangle
  await pane(page, 6);
  await clickDraw(page, 1 * IN, 1 * IN); await moveDraw(page, 3 * IN, 2.2 * IN); await clickDraw(page, 3 * IN, 2.2 * IN);
  // ellipse
  await pane(page, 7);
  await clickDraw(page, 5 * IN, 1.6 * IN); await moveDraw(page, 6.5 * IN, 2.3 * IN); await clickDraw(page, 6.5 * IN, 2.3 * IN);
  // text
  await pane(page, 5);
  await clickDraw(page, 1 * IN, 5.2 * IN); await page.keyboard.type('Hello RISC OS'); await page.keyboard.press('Enter'); await page.keyboard.type('Draw 1.11');
  await clickDraw(page, 4 * IN, 5.5 * IN); await page.keyboard.press('Escape');
  // a path being entered (construction lines)
  await pane(page, 0);
  await clickDraw(page, 4 * IN, 6 * IN); await moveDraw(page, 5 * IN, 6.6 * IN); await clickDraw(page, 5 * IN, 6.6 * IN); await moveDraw(page, 6 * IN, 6.2 * IN);
  await sleep(page, 300);
  return winClip(page);
}

export async function select(page) {
  await shapes(page);
  await page.keyboard.press('Escape');
  await pane(page, 8);
  // click the ellipse, adjust-click the rectangle (shift+click = adjust)
  await clickDraw(page, 5.5 * IN, 1.9 * IN);
  await clickDraw(page, 2 * IN, 1.5 * IN, { modifiers: ['Shift'] });
  // grid on
  await page.keyboard.press('F1');
  await sleep(page, 200);
  return winClip(page);
}

export async function menu(page) {
  await shapes(page);
  await page.keyboard.press('Escape');
  const p = await toPage(page, 6 * IN, 5 * IN);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await sleep(page, 300);
  // hover over Style's arrow
  const items = page.locator('.menu .mitem');
  const b = await items.nth(2).boundingBox();
  await page.mouse.move(b.x + b.width - 6, b.y + 10, { steps: 4 });
  await sleep(page, 300);
  const items2 = page.locator('.menu').nth(1).locator('.mitem');
  const b2 = await items2.nth(3).boundingBox();
  await page.mouse.move(b2.x + b2.width - 20, b2.y + 10, { steps: 4 });
  await page.mouse.move(b2.x + b2.width - 6, b2.y + 10, { steps: 4 });
  await sleep(page, 400);
}

export async function dbgsel(page) {
  await shapes(page);
  await page.evaluate(() => { globalThis.__drawDebug = 1; });
  await page.keyboard.press('Escape');
  await pane(page, 8);
  const info = () => page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); return { main: d.main, sub: d.sub, sel: d.selected().map((o) => d.objects.indexOf(o)), n: d.objects.length, bb: d.objects.map((o) => o.bbox) }; });
  console.log(JSON.stringify(await info()));
  await clickDraw(page, 5.5 * IN, 1.9 * IN);
  console.log(JSON.stringify(await info()));
  await clickDraw(page, 2 * IN, 1.5 * IN, { modifiers: ['Shift'] });
  console.log(JSON.stringify((await info()).sel));
}

export async function dbgtri(page) {
  await shapes(page);
  console.log(JSON.stringify(await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); return d.objects[0]; })));
}

export async function dbgesc(page) {
  await shapes(page);
  const f = () => page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); return [d.objects.length, d.main, d.sub, JSON.stringify(d.objects[0]?.elements)]; });
  console.log(await f());
  await page.keyboard.press('Escape');
  await sleep(page, 200);
  console.log(await f());
}

async function openFile(page, path, win = { x: 60, y: 30, w: 1100, h: 880 }) {
  await page.evaluate(() => window.os.apps.start('Draw'));
  await sleep(page, 500);
  await page.evaluate(async ([p, win]) => {
    const d = await globalThis.__draw.loadFileNew(p);
    const v = d.views[0], w = v.win;
    const bb = globalThis.__draw.DF.docBBox(d);
    const tl = v.toWork(bb.x0, bb.y1);
    w.open({ x: win.x, y: win.y, w: win.w, h: win.h, scrollX: Math.max(0, tl.x - 20), scrollY: Math.max(0, tl.y - 20) });
  }, [path, win]);
  await sleep(page, 1500);
  return winClip(page);
}
export const map = (page) => openFile(page, 'ADFS::HardDisc4.$.Tutorials.DrawTutor.Map');
export const sign = (page) => openFile(page, 'ADFS::HardDisc4.$.Tutorials.DrawTutor.Sign');
export const demo = (page) => openFile(page, 'ADFS::HardDisc4.$.Tutorials.WelcomeGde.DrawDemo');

/** invoke a menu entry programmatically: path of item texts (writable items: {value}) */
async function pick(page, path, value) {
  return page.evaluate(async ([path, value]) => {
    const D = globalThis.__draw; const d = D.diagrams.at(-1); const v = d.views[0];
    let m = D.menuFor(v);
    for (let i = 0; i < path.length; i++) {
      const t = path[i];
      const it = m.items.find((x) => (typeof x.text === 'function' ? x.text() : x.text) === t) ?? (t === '' ? m.items.find((x) => x.writable) : null);
      if (!it) throw new Error('no item ' + t + ' in ' + m.title + ': ' + m.items.map((x) => x.text).join('|'));
      if (i === path.length - 1) {
        if (it.writable && value != null) it.writable.value = value;
        await it.action?.({ item: it, value: it.writable?.value, button: 'select' });
        return true;
      }
      let s = it.submenu; if (typeof s === 'function') s = await s({});
      m = s;
    }
  }, [path, value]);
}
/** open the real menu and hover along a path of item texts */
async function menuUI(page, at, path) {
  const p = await toPage(page, ...at);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await sleep(page, 250);
  for (let lvl = 0; lvl < path.length; lvl++) {
    const menu = page.locator('.menu').nth(lvl);
    const items = menu.locator('.mitem');
    const n = await items.count();
    let idx = -1;
    for (let i = 0; i < n; i++) { const t = (await items.nth(i).innerText()).split('\n')[0].trim(); if (t === path[lvl]) { idx = i; break; } }
    if (idx < 0) throw new Error('menu item not found ' + path[lvl]);
    const b = await items.nth(idx).boundingBox();
    await page.mouse.move(b.x + 20, b.y + 10, { steps: 2 });
    await page.mouse.move(b.x + b.width - 6, b.y + 10, { steps: 4 });
    await sleep(page, 350);
  }
}

export async function styles(page) {
  await start(page);
  await bigWindow(page);
  const tri = async (x, y) => { await clickDraw(page, x * IN, y * IN); await moveDraw(page, (x + 1) * IN, (y + 1.2) * IN); await clickDraw(page, (x + 1) * IN, (y + 1.2) * IN); await moveDraw(page, (x + 2) * IN, y * IN); const q = await toPage(page, (x + 2) * IN, y * IN); await page.mouse.dblclick(q.x, q.y); await sleep(page, 150); };
  await pick(page, ['Style', 'Line width', '4']);
  await pick(page, ['Style', 'Join', 'Round']);
  await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); d.path.fill = 0x00CCEE00; d.path.stroke = 0x0000DD00; });
  await tri(1, 4.8);
  await pick(page, ['Style', 'Join', 'Mitred']);
  await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); d.path.fill = 0x99440000; d.path.stroke = 0x00000000; d.path.winding = 0; });
  await tri(4, 4.8);
  // open line with arrow heads, dashed
  await pane(page, 0);
  await pick(page, ['Style', 'Line width', '2']);
  await pick(page, ['Style', 'Start cap', 'Round']);
  await pick(page, ['Style', 'End cap', 'Triangle']);
  await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); d.path.fill = 0xFFFFFFFF; d.path.stroke = 0x00008800; });
  await clickDraw(page, 1 * IN, 3.5 * IN); await moveDraw(page, 4 * IN, 4 * IN); const q = await toPage(page, 4 * IN, 4 * IN); await page.mouse.dblclick(q.x, q.y);
  await pick(page, ['Style', 'End cap', 'Butt']); await pick(page, ['Style', 'Start cap', 'Butt']);
  await pick(page, ['Style', 'Line width', '1']);
  await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); d.path.dash = { offset: 0, elements: [9 * 256, 9 * 256] }; d.path.stroke = 0; });
  await clickDraw(page, 4.5 * IN, 3.5 * IN); await moveDraw(page, 7.5 * IN, 4 * IN); const q2 = await toPage(page, 7.5 * IN, 4 * IN); await page.mouse.dblclick(q2.x, q2.y);
  // outline font text
  await pane(page, 5);
  await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); d.font.ref = d.fontRef('Trinity.Medium'); d.font.xsize = d.font.ysize = 24 * 640; d.font.colour = 0x00008800; });
  await clickDraw(page, 1 * IN, 2.3 * IN); await page.keyboard.type('Trinity 24pt text'); await page.keyboard.press('Enter');
  await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); d.font.ref = d.fontRef('Homerton.Bold.Oblique'); d.font.xsize = 20 * 640; d.font.ysize = 14 * 640; d.font.colour = 0; });
  await page.keyboard.type('Homerton.Bold.Oblique');
  await sleep(page, 300);
  await page.keyboard.press('Enter');
  // select the green triangle and rotate it via Transform
  await pane(page, 8);
  await clickDraw(page, 2 * IN, 5.3 * IN);
  await pick(page, ['Transform', 'Rotate', ''], '30');
  await clickDraw(page, 1.5 * IN, 2.4 * IN, { modifiers: ['Shift'] });
  await pick(page, ['Transform', 'Rotate', ''], '-20');
  await sleep(page, 400);
  return winClip(page);
}
export async function dbgtext(page) {
  await start(page);
  await bigWindow(page);
  await pane(page, 5);
  await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); d.font.ref = d.fontRef('Trinity.Medium'); d.font.xsize = d.font.ysize = 24 * 640; d.font.colour = 0x00008800; });
  await clickDraw(page, 1 * IN, 2.3 * IN); await page.keyboard.type('Trinity 24pt text');
  console.log(JSON.stringify(await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); return { sub: d.sub, cons: d.cons, caret: !!wimp.caret?.window, n: d.objects.length }; })));
  await page.keyboard.press('Enter');
  console.log(JSON.stringify(await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); return { sub: d.sub, objs: d.objects }; })));
  return winClip(page);
}
export async function dbgrot(page) {
  const clip = await styles(page);
  console.log(JSON.stringify(await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); return d.objects.filter((o) => o.type.includes('text')); })));
  return clip;
}
export async function dbgrot2(page) {
  const clip = await styles(page);
  // hide the unrotated line then find extents of dark red pixels
  await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); d.objects = d.objects.filter((o) => o.type !== 'text'); d.sel.clear(); d.redrawAll(); });
  await sleep(page, 200);
  console.log(JSON.stringify(await page.evaluate(() => {
    const d = globalThis.__draw.diagrams.at(-1); const v = d.views[0]; const c = v.win._canvas; const g = c.getContext('2d');
    const id = g.getImageData(0, 0, c.width, c.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const o = (y * c.width + x) * 4; if (id[o] > 100 && id[o + 1] < 60 && id[o + 2] < 60 && id[o] < 180) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
    const o = d.objects.find((q) => q.type === 'trfmtext'); const b = o.bbox; const p0 = v.toWork(b.x0, b.y1), p1 = v.toWork(b.x1, b.y0);
    return { pix: [x0 + v.win.scrollX, y0 + v.win.scrollY, x1 + v.win.scrollX, y1 + v.win.scrollY], bbox: [p0.x, p0.y, p1.x, p1.y] };
  })));
  return clip;
}
export async function rottext(page) {
  await start(page);
  await bigWindow(page);
  await pane(page, 5);
  await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); d.font.ref = d.fontRef('Trinity.Medium'); d.font.xsize = d.font.ysize = 24 * 640; });
  await clickDraw(page, 1 * IN, 4 * IN); await page.keyboard.type('Rotated -20'); await page.keyboard.press('Enter');
  await page.keyboard.type('Rotated 45'); await page.keyboard.press('Enter');
  await page.keyboard.type('Plain text line'); await page.keyboard.press('Escape');
  await pane(page, 8);
  await clickDraw(page, 1.5 * IN, 4.1 * IN);
  await pick(page, ['Transform', 'Rotate', ''], '-20');
  await clickDraw(page, 1.5 * IN, 3.7 * IN);
  await pick(page, ['Transform', 'Rotate', ''], '45');
  await clickDraw(page, 1.5 * IN, 4.1 * IN, { modifiers: ['Shift'] });
  await clickDraw(page, 1.5 * IN, 3.35 * IN, { modifiers: ['Shift'] });
  await sleep(page, 300);
  return winClip(page);
}
export async function picker(page) { await start(page); await bigWindow(page); await menuUI(page, [3 * IN, 5 * IN], ['Style', 'Fill colour']); await sleep(page, 800); }
export async function savebox(page) { await start(page); await bigWindow(page); await menuUI(page, [3 * IN, 5 * IN], ['Save', 'File']); await sleep(page, 500); }
export async function info(page) { await start(page); await bigWindow(page); await menuUI(page, [3 * IN, 5 * IN], ['Misc', 'Info']); await sleep(page, 500); }
export async function zoom(page) { await start(page); await bigWindow(page); await menuUI(page, [3 * IN, 5 * IN], ['Zoom']); await sleep(page, 500); }
export async function gridmenu(page) { await start(page); await bigWindow(page); await menuUI(page, [3 * IN, 5 * IN], ['Grid', 'Inch']); await sleep(page, 500); }
export async function fontmenu(page) { await start(page); await bigWindow(page); await menuUI(page, [3 * IN, 5 * IN], ['Style', 'Font name', 'Trinity']); await sleep(page, 500); }
export async function selmenu(page) { await start(page); await bigWindow(page); await menuUI(page, [3 * IN, 5 * IN], ['Select']); await sleep(page, 500); }
export async function filerrun(page) {
  // double-click semantics on a Drawfile (Draw not running yet)
  await page.evaluate(() => window.os.filer.run('ADFS::HardDisc4.$.Tutorials.DrawTutor.Sign'));
  await sleep(page, 2500);
  const r = await page.evaluate(() => ({ running: window.os.apps.tasksOf('Draw').length, n: globalThis.__draw?.diagrams.length, t: globalThis.__draw?.diagrams.map((d) => d.filename) }));
  console.log(JSON.stringify(r));
  // and again while running: should open a second diagram
  await page.evaluate(() => window.os.filer.run('ADFS::HardDisc4.$.Tutorials.WelcomeGde.DrawDemo'));
  await sleep(page, 1500);
  console.log(JSON.stringify(await page.evaluate(() => globalThis.__draw?.diagrams.map((d) => d.filename))));
}
export async function roundtrip(page) {
  await page.evaluate(() => window.os.apps.start('Draw'));
  await sleep(page, 500);
  const r = await page.evaluate(async () => {
    const D = globalThis.__draw;
    const src = 'ADFS::HardDisc4.$.Tutorials.DrawTutor.Map';
    const orig = await window.os.vfs.readFile(src);
    const d = await D.loadFileNew(src);
    // save via the Save box's data provider path: serialise through menu item
    const dst = 'RAM::RamDisc0.$.MapCopy';
    const m = D.menuFor(d.views[0]);
    const save = m.items[1].submenu(); const fileBox = save.items[0].submenu();
    // simulate typing a full path + OK
    fileBox.icons[1].setText(dst);
    fileBox.emit('click', { button: 'select', icon: fileBox.icons[0] });
    await new Promise((r) => setTimeout(r, 500));
    const out = await window.os.vfs.readFile(dst);
    const A = D.DF.parseDrawfile(orig), B = D.DF.parseDrawfile(out);
    const same = JSON.stringify(A.objects.map((o) => o.type)) === JSON.stringify(B.objects.map((o) => o.type));
    // compare object byte streams (strip header, font table and options)
    const strip = (b) => { const v = new DataView(b.buffer, b.byteOffset, b.byteLength); const parts = []; let o = 40; while (o + 8 <= b.length) { const t = v.getUint32(o, true) & 255, s = v.getUint32(o + 4, true); if (s < 8) break; if (t !== 0 && t !== 11) parts.push(...b.slice(o, o + s)); o += s; } return parts; };
    const sa = strip(orig), sb = strip(out);
    let diff = -1; for (let i = 0; i < Math.max(sa.length, sb.length); i++) if (sa[i] !== sb[i]) { diff = i; break; }
    return { origLen: orig.length, outLen: out.length, same, objBytesEqual: diff < 0, diff, title: d.views[0].win.title, stat: window.os.vfs.stat(dst)?.filetype };
  });
  console.log(JSON.stringify(r));
}
async function dragDraw(page, x0, y0, x1, y1, mods = []) {
  const a = await toPage(page, x0, y0), b = await toPage(page, x1, y1);
  for (const m of mods) await page.keyboard.down(m);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await sleep(page, 30);
  await page.mouse.move(a.x + (b.x - a.x) / 4, a.y + (b.y - a.y) / 4, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 8 }); await sleep(page, 150);
  await page.mouse.up();
  for (const m of mods) await page.keyboard.up(m);
  await sleep(page, 150);
}
async function curvePath(page) {
  await pane(page, 3);    // closed curve
  const pts = [[1.5, 3], [3, 4.5], [4.5, 3], [3, 1.8]];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    await moveDraw(page, x * IN, y * IN);
    if (i < pts.length - 1) await clickDraw(page, x * IN, y * IN);
    else { const q = await toPage(page, x * IN, y * IN); await page.mouse.dblclick(q.x, q.y); }
  }
  await sleep(page, 200);
}
export async function edit(page) {
  await start(page); await bigWindow(page);
  await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); d.path.fill = 0x88EEEE00; d.path.width = 640; });
  await curvePath(page);
  // adjust-click on the object: edit mode, element at (3,4.5)
  await clickDraw(page, 3 * IN, 4.5 * IN, { modifiers: ['Shift'] });
  await sleep(page, 200);
  // drag the point at (4.5,3) to (5.5,3.5)
  await dragDraw(page, 4.5 * IN, 3 * IN, 5.5 * IN, 3.5 * IN, ['Shift']);
  const st = await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); return { main: d.main, sub: d.sub, cur: d.edit?.cur }; });
  console.log(JSON.stringify(st));
  return winClip(page);
}
export async function drags(page) {
  await start(page); await bigWindow(page);
  await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); d.path.fill = 0x00CCEE00; d.path.width = 640; });
  await curvePath(page);
  await pane(page, 6);
  await clickDraw(page, 5 * IN, 5 * IN); await moveDraw(page, 6.5 * IN, 6 * IN); await clickDraw(page, 6.5 * IN, 6 * IN);
  await pane(page, 8);
  // select the curve and move it by dragging
  await clickDraw(page, 3 * IN, 3 * IN);
  await dragDraw(page, 3 * IN, 3 * IN, 3.5 * IN, 2.5 * IN);
  // scale via the stretch handle of the rectangle: select, drag bottom-right handle
  await clickDraw(page, 5.5 * IN, 5.5 * IN);
  const h = await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); const o = d.selected()[0]; return o.bbox; });
  await dragDraw(page, h.x1 + 1024, h.y0 - 1024, h.x1 + 0.5 * IN, h.y0 - 0.5 * IN);
  // rotate via the rotate handle
  const h2 = await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); return d.selected()[0].bbox; });
  await dragDraw(page, h2.x1 + 1024, h2.y1 + 1024, h2.x1 - 0.3 * IN, h2.y1 + 0.8 * IN);
  // rubber-band select everything
  await dragDraw(page, 0.5 * IN, 7 * IN, 7.8 * IN, 0.8 * IN);
  const r = await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); return { sel: d.sel.size, n: d.objects.length, undo: d.undo.length }; });
  console.log(JSON.stringify(r));
  return winClip(page);
}
export async function imports(page) {
  await start(page); await bigWindow(page);
  // drop files onto the window via the DataLoad route (as the Filer does)
  const drop = async (path, x, y) => page.evaluate(async ([path, x, y]) => {
    const d = globalThis.__draw.diagrams.at(-1); const v = d.views[0]; const st = window.os.vfs.stat(path);
    const w = v.toWork(x, y);
    window.wimp.dataLoad({ window: v.win, x: w.x, y: w.y }, [{ path: st.path, filetype: st.filetype, size: st.size }]);
  }, [path, x, y]);
  await drop('ADFS::HardDisc4.$.Images.00-49.sa05', 0.5 * IN, 3.5 * IN);
  await drop('ADFS::HardDisc4.$.Tutorials.PaintTutor.Flower', 5 * IN, 5 * IN);
  await drop('ADFS::HardDisc4.$.Tutorials.DrawTutor.Sign', 4.5 * IN, 0.5 * IN);
  await page.evaluate(() => window.os.vfs.writeFile('RAM::RamDisc0.$.Words', 'This is a plain text file dropped onto Draw. It becomes a text area: justified Trinity 12pt with the standard header prepended.\n\nSecond paragraph of the text area.\n', { filetype: 0xFFF }));
  await drop('RAM::RamDisc0.$.Words', 0.5 * IN, 0.5 * IN);
  await sleep(page, 1500);
  const r = await page.evaluate(() => globalThis.__draw.diagrams.at(-1).objects.map((o) => o.type + ':' + JSON.stringify(o.bbox)));
  console.log(r.join('\n'));
  return winClip(page);
}
export async function closeq(page) {
  await start(page); await bigWindow(page);
  await clickDraw(page, 1 * IN, 3 * IN); await moveDraw(page, 3 * IN, 4 * IN); const q = await toPage(page, 3 * IN, 4 * IN); await page.mouse.dblclick(q.x, q.y);
  await sleep(page, 200);
  // undo / redo
  await page.keyboard.press('F8'); await sleep(page, 100);
  const a = await page.evaluate(() => globalThis.__draw.diagrams.at(-1).objects.length);
  await page.keyboard.press('F9'); await sleep(page, 100);
  const b = await page.evaluate(() => globalThis.__draw.diagrams.at(-1).objects.length);
  console.log('after undo', a, 'after redo', b);
  // new view
  await pick(page, ['Misc', 'New view']);
  await sleep(page, 300);
  console.log(await page.evaluate(() => globalThis.__draw.diagrams.at(-1).views.map((v) => v.win.title)));
  // close first view (fine), then the second -> query
  await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); d.views[1].win.requestClose({}); });
  await sleep(page, 200);
  await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); d.views[0].win.requestClose({}); });
  await sleep(page, 500);
}
export async function zoomed(page) {
  await openFile(page, 'ADFS::HardDisc4.$.Tutorials.DrawTutor.Map');
  await page.evaluate(() => { const D = globalThis.__draw; const d = D.diagrams.at(-1); const v = d.views[0]; D.zoomTo(v, 3, 1); v.win.open({ scrollX: 700, scrollY: 1300 }); });
  await sleep(page, 1200);
  return winClip(page);
}
async function openVendor(page, rel, win) {
  await page.evaluate(async (rel) => {
    const r = await fetch('vendor/ro371/' + rel);
    const b = new Uint8Array(await r.arrayBuffer());
    const leaf = rel.split('/').pop().replace(/,aff$/, '').replace(/[^A-Za-z0-9]/g, '');
    window.os.vfs.writeFile('RAM::RamDisc0.$.' + leaf, b, { filetype: 0xAFF });
  }, rel);
  const leaf = rel.split('/').pop().replace(/,aff$/, '').replace(/[^A-Za-z0-9]/g, '');
  return openFile(page, 'RAM::RamDisc0.$.' + leaf, win);
}
const V = 'Sources/Apps/Draw/Test/';
export const butterfly = (p) => openVendor(p, V + 'Pictures/Draw/butterfly,aff');
export const golfer = (p) => openVendor(p, V + 'Pictures/Draw/DrawGolfer,aff');
export const face = (p) => openVendor(p, V + 'Pictures/Draw/Face,aff');
export const coffee = (p) => openVendor(p, V + 'Pictures/Draw/coffee,aff');
export const trfmtext = (p) => openVendor(p, V + 'TrfmText,aff');
export const trfmsprite = (p) => openVendor(p, V + 'Trfmsprite,aff');
export const fonts = (p) => openVendor(p, V + 'Pictures/Draw/Fonts,aff');
export const latin1 = (p) => openVendor(p, V + 'Latin1-4,aff');
export const sidney = (p) => openVendor(p, V + 'Sidney,aff');
export const drawdemon = (p) => openVendor(p, V + 'Pictures/Draw/DrawDemoN,aff');
export const allin = (p) => openVendor(p, V + 'Allin,aff');
export const textarea = (p) => openVendor(p, 'Sources/OS_Core/Video/Render/DrawFile/TestFiles/TextArea,aff');
export const jpegf = (p) => openVendor(p, 'Sources/OS_Core/Video/Render/DrawFile/TestFiles/jpeg,aff');
export const a4 = (p) => openVendor(p, 'Sources/OS_Core/Video/Render/DrawFile/TestFiles/A4,aff');
export const plaque = (p) => openVendor(p, 'Sources/Demos/Tutorials/Plaque,aff');
export const window1 = (p) => openVendor(p, V + 'Pictures/Draw/Window,aff');
export const underline = (p) => openVendor(p, V + 'Underline,aff');

// End-to-end with real mouse: shapes, group/front/back/undo keys, Save-as drag to a Filer window,
// double-click a Drawfile in the Filer, drag a Drawfile from the Filer onto a Draw window, Printers renderer.
export async function e2e(page) {
  const log = (k, v) => console.log(k, JSON.stringify(v));
  await page.evaluate(() => window.os.filer.openDir('RAM::RamDisc0.$', { x: 900, y: 60, w: 330, h: 160 }));
  await start(page);
  await page.evaluate(() => { const w = globalThis.__draw.diagrams.at(-1).views[0].win; w.open({ x: 60, y: 40, w: 760, h: 560, scrollX: 0, scrollY: w.extent.y1 - 560 }); });
  await sleep(page, 200);
  await pane(page, 6);   // rectangle
  await clickDraw(page, 1 * IN, 1 * IN); await moveDraw(page, 3 * IN, 2.5 * IN); await clickDraw(page, 3 * IN, 2.5 * IN);
  await pane(page, 7);   // ellipse overlapping it
  await clickDraw(page, 2.5 * IN, 2 * IN); await moveDraw(page, 4 * IN, 3 * IN); await clickDraw(page, 4 * IN, 3 * IN);
  await pane(page, 8);
  const st = () => page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); return { types: d.objects.map((o) => o.type + (d.sel.has(o) ? "*" : "")), sel: d.sel.size, undo: d.canUndo(), redo: d.canRedo(), title: d.views[0].win.title }; });
  // select the rectangle and bring it to the front (^F), then back (^B)
  await clickDraw(page, 1.2 * IN, 1.5 * IN);
  await page.keyboard.press('Control+f'); await sleep(page, 100);
  log('front', await st());
  await page.keyboard.press('Control+b'); await sleep(page, 100);
  log('back', await st());
  await page.keyboard.press('Control+a'); await page.keyboard.press('Control+g'); await sleep(page, 100);
  log('grouped', await st());
  await page.keyboard.press('F8'); await sleep(page, 100);
  log('undo', await st());
  await page.keyboard.press('F9'); await sleep(page, 100);
  log('redo', await st());
  // Menu > Save > File, drag the icon to the RAM disc viewer
  const c = await toPage(page, 5 * IN, 5 * IN);
  await page.mouse.click(c.x, c.y, { button: 'right' }); await sleep(page, 200);
  const hover = async (level, idx) => { const b = await page.locator('.menu').nth(level).locator('.mitem').nth(idx).boundingBox(); await page.mouse.move(b.x + 20, b.y + 10, { steps: 2 }); await page.mouse.move(b.x + b.width - 6, b.y + 10, { steps: 3 }); await sleep(page, 300); };
  await hover(0, 1); await hover(1, 0);
  await page.screenshot({ path: 'tests/screens/draw-e2e-savebox.png' });
  const icon = await page.evaluate(() => { const w = window.wimp.menus.levels.at(-1).win; const ic = w.icons.find((i) => i.sprite || /file_/.test(i.validation ?? '')) ?? w.icons[2]; return w.workToScreen((ic.bbox.x0 + ic.bbox.x1) / 2, (ic.bbox.y0 + ic.bbox.y1) / 2); });
  await page.mouse.move(icon.x, icon.y); await page.mouse.down();
  await page.mouse.move(icon.x + 20, icon.y + 20, { steps: 4 }); await page.mouse.move(1000, 150, { steps: 10 }); await page.mouse.up();
  await sleep(page, 700);
  const saved = await page.evaluate(async () => { const s = window.os.vfs.stat('RAM::RamDisc0.$.DrawFile'); if (!s) return null; const b = await window.os.vfs.readFile(s.path); const doc = globalThis.__draw.DF.parseDrawfile(b); return { type: s.filetype.toString(16), size: s.size, objs: doc.objects.map((o) => o.type), title: globalThis.__draw.diagrams[0].views[0].win.title }; });
  log('saved', saved);
  // double-click a Drawfile in a Filer window
  await page.evaluate(() => window.os.filer.openDir('ADFS::HardDisc4.$.Tutorials.DrawTutor', { x: 880, y: 300, w: 360, h: 160 }));
  await sleep(page, 500);
  const at = (name) => page.evaluate((name) => { const v = [...window.os.filer.viewers.values()].find((q) => /drawtutor$/i.test(q.path ?? q.dir ?? '')) ?? [...window.os.filer.viewers.values()].at(-1); const i = v.items.findIndex((x) => x.name === name); const r = v.hotRect(i); return v.win.workToScreen((r.x0 + r.x1) / 2, r.y0 + 15); }, name);
  const sign = await at('Sign');
  await page.mouse.dblclick(sign.x, sign.y); await sleep(page, 1500);
  log('dblclick', await page.evaluate(() => globalThis.__draw.diagrams.map((d) => [d.filename, d.objects.length])));
  // drag Map from the Filer onto the first (saved) Draw window
  const map = await at('Map');
  await page.evaluate(() => globalThis.__draw.diagrams[0].views[0].win.bringToFront());
  const tgt = await page.evaluate(() => { const w = globalThis.__draw.diagrams[0].views[0].win; return { x: w.x + 300, y: w.y + 300 }; });
  await page.mouse.move(map.x, map.y); await page.mouse.down();
  await page.mouse.move(map.x - 20, map.y + 10, { steps: 4 }); await page.mouse.move(tgt.x, tgt.y, { steps: 12 }); await page.mouse.up();
  await sleep(page, 1500);
  log('dropped', await page.evaluate(() => { const d = globalThis.__draw.diagrams[0]; return { n: d.objects.length, modified: d.modified, title: d.views[0].win.title }; }));
  // Printers renderer registered by Draw's boot hook
  log('printer', await page.evaluate(async () => {
    const r = (window.os.printerRenderers ?? []).find(([t]) => t === 0xAFF);
    if (!r) return 'no renderer';
    const b = await window.os.vfs.readFile('ADFS::HardDisc4.$.Tutorials.DrawTutor.Sign');
    const { html } = await r[1](b);
    const P = await import('/src/apps/Printers/print.js');
    const f = await P.renderFile('ADFS::HardDisc4.$.Tutorials.DrawTutor.Map', 0xAFF);   // no renderers: built-in fallback
    const img = new Image(); img.src = /src="([^"]+)"/.exec(f.html)[1]; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g2 = c.getContext('2d'); g2.drawImage(img, 0, 0);
    const g = g2.getImageData(0, 0, c.width, c.height).data;
    let ink = 0; for (let i = 0; i < g.length; i += 4) if (g[i] < 200 || g[i + 1] < 200 || g[i + 2] < 200) ink++;
    return { signStyle: /style="([^"]+)"/.exec(html)[1], mapStyle: /style="([^"]+)"/.exec(f.html)[1], w: img.width, h: img.height, ink };
  }));
}

// Random clicks / drags / keys / menu picks inside Draw windows; reports page errors (run.mjs prints logs).
export async function monkey(page) {
  let seed = Number(process.env.SEED ?? 7);
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  await page.evaluate(() => window.os.apps.start('Draw'));
  await sleep(page, 500);
  await page.evaluate(() => globalThis.__draw.loadFileNew('ADFS::HardDisc4.$.Tutorials.DrawTutor.Sign'));
  await start(page); await bigWindow(page);
  const keys = ['F1', 'Shift+F1', 'F4', 'Shift+F4', 'Control+F4', 'F5', 'Control+F5', 'F6', 'Shift+F6', 'Control+F6', 'F7', 'F8', 'F9', 'Control+F8', 'Control+F9', 'Tab', 'Enter', 'Escape', 'Backspace', 'Delete', 'Control+a', 'Control+c', 'Control+g', 'Control+u', 'Control+e', 'Control+f', 'Control+b', 'Control+q', 'Control+w', 'Control+r', 'Control+s', 'Control+x', 'Control+z', 'Control+j', 'a', 'b'];
  for (let i = 0; i < Number(process.env.STEPS ?? 400); i++) {
    const r = await page.evaluate(() => { const d = globalThis.__draw.diagrams.at(-1); const w = d?.views[0]?.win; return w && w.isOpen ? { x: w.x, y: w.y, w: w.w, h: w.h } : null; });
    if (!r) { await start(page); await bigWindow(page); continue; }
    const x = r.x + 10 + rnd(r.w - 20), y = r.y + 10 + rnd(r.h - 20);
    const a = rnd(10);
    if (a < 3) await page.mouse.click(x, y, { modifiers: rnd(4) === 0 ? ['Shift'] : [] });
    else if (a < 4) await page.mouse.dblclick(x, y);
    else if (a < 6) { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + rnd(200) - 100, y + rnd(200) - 100, { steps: 5 }); await page.mouse.up(); }
    else if (a < 8) await page.keyboard.press(keys[rnd(keys.length)]);
    else if (a < 9) await pane(page, rnd(9));
    else {
      // open the menu and pick a random leaf a couple of levels down
      await page.mouse.click(x, y, { button: 'right' }); await sleep(page, 60);
      for (let lv = 0; lv < 3; lv++) {
        const n = await page.locator('.menu').nth(lv).locator('.mitem').count().catch(() => 0);
        if (!n) break;
        const b = await page.locator('.menu').nth(lv).locator('.mitem').nth(rnd(n)).boundingBox().catch(() => null);
        if (!b) break;
        if (rnd(3) === 0 || lv === 2) { await page.mouse.click(b.x + 20, b.y + 8); break; }
        await page.mouse.move(b.x + 20, b.y + 8, { steps: 2 }); await page.mouse.move(b.x + b.width - 6, b.y + 8, { steps: 2 }); await sleep(page, 150);
      }
      await page.keyboard.press('Escape');
    }
    await sleep(page, 20);
  }
  // close any error box
  console.log('monkey done', JSON.stringify(await page.evaluate(() => globalThis.__draw.diagrams.map((d) => d.objects.length))));
}
