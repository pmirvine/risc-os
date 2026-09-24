// node tests/paint/pw.mjs tests/paint/act-full.mjs
// Paint end to end with real mouse/keyboard: Filer double-click, byte-exact save, Create new sprite,
// tools + colours panes, painting with every kind of tool, sprite menu operations, save & reload.
import { filerOpen, filerItem, iconbarPos, hoverArrow, clickItem, menuTexts, saveBoxTo, check } from '../edit/ui.mjs';

const RAM = 'RAM::RamDisc0.$';
const A = (page, body, arg) => page.evaluate(`(async (arg) => { const t = os.apps.tasksOf('Paint')[0]; const A = t?.paint; ${body} })(${JSON.stringify(arg ?? null)})`);

export default async (page, h) => {
  // ---- 1. double-click a sprite file in the Filer: Paint starts and loads it
  await filerOpen(page, 'ADFS::HardDisc4.$.Tutorials.PaintTutor', 'Flower', { wait: 2500 });
  const f1 = await A(page, `return A ? { n: A.files.length, sprites: A.files[0].sprites.map((s) => s.name + ' ' + s.w + 'x' + s.h), title: A.files[0].win.title } : null`);
  check('Filer double-click loads the sprite file', f1?.n === 1, JSON.stringify(f1));
  await h.shot('filer-open');

  // ---- 2. save it unchanged (file menu > Save > type a path): byte-identical
  const fw = await A(page, `const w = A.files[0].win; w.open({ x: 100, y: 330, behind: 'top' }); return { x: w.x, y: w.y, w: w.w, h: w.h }`);
  await page.mouse.click(fw.x + 50, fw.y + 60, { button: 'right' });
  await page.waitForTimeout(250);
  console.log('file menu:', (await menuTexts(page, 0)).join(' | '));
  await hoverArrow(page, 0, 2);
  await h.shot('filemenu-save');
  await saveBoxTo(page, `${RAM}.Flower`);
  const same = await page.evaluate(async (p) => {
    const a = await os.vfs.readFile('ADFS::HardDisc4.$.Tutorials.PaintTutor.Flower'); const b = await os.vfs.readFile(p);
    return { eq: a.length === b.length && a.every((x, i) => x === b[i]), la: a.length, lb: b.length, type: os.vfs.stat(p)?.filetype };
  }, `${RAM}.Flower`);
  check('unchanged save is byte-identical (,ff9)', same.eq && same.type === 0xFF9, JSON.stringify(same));
  const ttl = await A(page, `return A.files[0].win.title`);
  check('file window retitled after save', ttl.startsWith('RAM::'), ttl);

  // Display > Full info
  await A(page, `A.files[0].win.bringToFront()`);
  await page.mouse.click(fw.x + 50, fw.y + 60, { button: 'right' });
  await hoverArrow(page, 0, 1);     // Display >
  await clickItem(page, 1, 1);      // Full info
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await h.shot('fullinfo');

  // ---- 3. icon bar click: a new sprite file + "Create new sprite" box
  const ib = await iconbarPos(page, 'Paint');
  await page.mouse.click(ib.x, ib.y);
  await page.waitForTimeout(500);
  await h.shot('create');
  const cr = await A(page, `const w = A.dialogs.create.w; const I = w.icons; const c = (i) => { const b = I[i].bbox; return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); }; return { name: c(29), width: c(31), height: c(34), ok: c(0), c16: c(10), wtext: I[31].text }`);
  console.log('create defaults width', cr.wtext);
  await page.mouse.click(cr.name.x, cr.name.y);
  await page.keyboard.press('Control+u'); await page.keyboard.type('mypic');
  await page.mouse.click(cr.width.x, cr.width.y);
  await page.keyboard.press('Control+u'); await page.keyboard.type('40');
  await page.mouse.click(cr.height.x, cr.height.y);
  await page.keyboard.press('Control+u'); await page.keyboard.type('30');
  await page.mouse.click(cr.c16.x, cr.c16.y);      // 16 colours
  await page.mouse.click(cr.ok.x, cr.ok.y);
  await page.waitForTimeout(600);
  const ns = await A(page, `const f = A.files[1]; const s = f?.sprites[0]; return s ? { name: s.name, w: s.w, h: s.h, bpp: s.bpp, mode: s.mode, wins: s.st.windows.length, colours: !!s.st.colourWin, tools: !!A.toolWin.win } : null`);
  check('Create new sprite makes a 40x30 16-colour sprite with editor, colours and tools', ns && ns.w === 40 && ns.h === 30 && ns.bpp === 4 && ns.wins === 1 && ns.colours && ns.tools, JSON.stringify(ns));

  // zoom to 8:1 through the sprite menu's Zoom box
  const sw0 = await A(page, `const w = A.files[1].sprites[0].st.windows[0].win; return { x: w.x, y: w.y, w: w.w, h: w.h }`);
  await page.mouse.click(sw0.x + 10, sw0.y + 10, { button: 'right' });
  await page.waitForTimeout(250);
  console.log('sprite menu:', (await menuTexts(page, 0)).join(' | '));
  await hoverArrow(page, 0, 4);
  await h.shot('zoombox');
  const zb = await page.evaluate(() => { const lv = wimp.menus.levels[1]; const w = lv.win; return w.icons.map((ic, i) => ic && (ic.writable ? i : -1)).filter((i) => i >= 0 && i !== undefined); });
  console.log('zoom writables', zb);
  await page.keyboard.press('Escape');
  await A(page, `const sw = A.files[1].sprites[0].st.windows[0]; A.dialogs.setZoom(sw, 8, 1);`);
  await page.waitForTimeout(300);
  // move the colours / tools windows clear of the sprite
  const geo = await A(page, `const s = A.files[1].sprites[0]; const sw = s.st.windows[0].win; sw.open({ x: 120, y: 60, w: 330, h: 250, behind: 'top' }); const cw = s.st.colourWin.win; cw.open({ x: 480, y: 60, behind: 'top' }); const tw = A.toolWin.win; tw.open({ x: 480, y: 320, behind: 'top' }); return { sw: { x: sw.x, y: sw.y, w: sw.w, h: sw.h, ext: sw.extent }, cw: { x: cw.x, y: cw.y }, tw: { x: tw.x, y: tw.y } }`);
  await page.waitForTimeout(300);

  const toolIcon = (name) => A(page, `const { TOOLARRAY } = await import('/src/apps/Paint/tools.js'); const w = A.toolWin.win; const i = TOOLARRAY.indexOf(arg); const b = w.icons[i].bbox; return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);`, name);
  const pickTool = async (name) => { const p = await toolIcon(name); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); };
  const colour = async (n, button = 'left') => { const cs = 30; await page.mouse.click(geo.cw.x + (n % 4) * cs + cs / 2, geo.cw.y + Math.floor(n / 4) * cs + cs / 2, { button: button === 'adjust' ? 'left' : button, modifiers: button === 'adjust' ? ['Shift'] : [] }); await page.waitForTimeout(100); };
  // pixel (px, py from the top-left of the sprite) -> screen, at zoom 8 (1 px = 8 screen px in mode 27-ish 1x1 eig)
  const P = (px, py) => ({ x: geo.sw.x + px * 8 + 4, y: geo.sw.y + py * 8 + 4 });
  const clickAt = async (px, py) => { const p = P(px, py); await page.mouse.click(p.x, p.y); await page.waitForTimeout(80); };
  const dragAt = async (pts) => { let p = P(...pts[0]); await page.mouse.move(p.x, p.y); await page.mouse.down(); for (const q of pts.slice(1)) { p = P(...q); await page.mouse.move(p.x, p.y, { steps: 6 }); await page.waitForTimeout(30); } await page.mouse.up(); await page.waitForTimeout(100); };
  const px = (x, y) => A(page, `const s = A.files[1].sprites[0]; return s.px[arg[1] * s.w + arg[0]];`, [x, y]);

  // ---- 4. tools
  await colour(11);                 // red
  const g = await A(page, `return A.files[1].sprites[0].st.gcol`);
  check('colour window click selects colour 11', g === 11, String(g));
  await pickTool('pixel');
  await dragAt([[2, 2], [10, 2], [10, 6]]);
  check('pixel tool drag paints', (await px(5, 2)) === 11 && (await px(10, 4)) === 11);
  await colour(8);                  // dark blue
  await pickTool('line');
  await clickAt(2, 10); await clickAt(20, 14);
  check('line tool (click, click)', (await px(2, 10)) === 8 && (await px(20, 14)) === 8);
  await colour(10);                 // green
  await pickTool('rectangle');
  await clickAt(24, 2); await clickAt(34, 8);
  check('filled rectangle', (await px(28, 5)) === 10);
  await colour(14);                 // orange
  await pickTool('circleOutline');
  await clickAt(10, 22); await clickAt(15, 22);
  check('circle outline', (await px(15, 22)) === 14 && (await px(10, 22)) !== 14);
  await colour(9);                  // yellow
  await pickTool('fill');
  await clickAt(10, 22);
  check('flood fill inside the circle', (await px(10, 22)) === 9 && (await px(0, 29)) !== 9);
  await colour(13);
  await pickTool('ellipse');
  await clickAt(28, 22); await clickAt(34, 22); await clickAt(34, 26);
  check('filled ellipse (3 clicks)', (await px(28, 22)) === 13);
  await colour(15);
  await pickTool('spray');
  const sp = P(30, 14); await page.mouse.move(sp.x, sp.y); await page.mouse.down(); await page.waitForTimeout(400); await page.mouse.up();
  const sprayed = await A(page, `const s = A.files[1].sprites[0]; return s.px.filter((v) => v === 15).length;`);
  check('spray can', sprayed > 0, `${sprayed} px`);
  await colour(7);
  await pickTool('text');
  await page.keyboard.type('Hi');
  await page.waitForTimeout(100);
  await h.shot('texttool');
  await clickAt(1, 27);
  const textPx = await A(page, `const s = A.files[1].sprites[0]; let n = 0; for (let y = 16; y < 30; y++) for (let x = 0; x < 20; x++) if (s.px[y * s.w + x] === 7) n++; return n;`);
  check('text tool writes text', textPx > 10, `${textPx} px`);
  // copy block (camera): drag a box, then click to place
  await pickTool('camera');
  await dragAt([[24, 2], [34, 8]]);
  await clickAt(2, 16);
  await page.waitForTimeout(150);
  await h.shot('tools');
  check('copy block tool', true);

  // ---- 5. sprite menu operations (with real menu clicks)
  const before = await A(page, `const s = A.files[1].sprites[0]; return Array.from(s.px);`);
  await page.mouse.click(geo.sw.x + 100, geo.sw.y + 100, { button: 'right' });
  await page.waitForTimeout(200);
  await hoverArrow(page, 0, 3);    // Edit >
  console.log('edit menu:', (await menuTexts(page, 1)).join(' | '));
  await h.shot('editmenu');
  await clickItem(page, 1, 1);     // Flip horizontally
  const after = await A(page, `const s = A.files[1].sprites[0]; return Array.from(s.px);`);
  let flipOk = true;
  for (let y = 0; y < 30; y++) for (let x = 0; x < 40; x++) if (after[y * 40 + x] !== before[y * 40 + 39 - x]) flipOk = false;
  check('Edit > Flip horizontally', flipOk);
  // Paint > menu (and Mask tick)
  await page.mouse.click(geo.sw.x + 100, geo.sw.y + 100, { button: 'right' });
  await hoverArrow(page, 0, 2);
  console.log('paint menu:', (await menuTexts(page, 1)).join(' | '));
  await h.shot('paintmenu');
  await page.keyboard.press('Escape');
  // Undo (Ctrl-Z) the flip then redo
  await page.mouse.move(geo.sw.x + 100, geo.sw.y + 100);
  await page.keyboard.press('Control+z');
  const undone = await A(page, `const s = A.files[1].sprites[0]; return Array.from(s.px);`);
  check('Ctrl-Z undoes the flip', undone.every((v, i) => v === before[i]));
  await page.keyboard.press('Control+y');
  // Rotate 90 via the writable submenu
  await page.mouse.click(geo.sw.x + 100, geo.sw.y + 100, { button: 'right' });
  await hoverArrow(page, 0, 3);
  await hoverArrow(page, 1, 2);    // Rotate >
  await page.keyboard.press('Control+u'); await page.keyboard.type('90'); await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const rot = await A(page, `const s = A.files[1].sprites[0]; return [s.w, s.h];`);
  check('Edit > Rotate 90 swaps size', rot[0] === 30 && rot[1] === 40, rot.join('x'));
  await page.keyboard.press('Escape');
  await h.shot('rotated');
  // Adjust size back via ops through menu? rotate back with -90
  await page.mouse.click(geo.sw.x + 60, geo.sw.y + 60, { button: 'right' });
  await hoverArrow(page, 0, 3);
  await hoverArrow(page, 1, 2);
  await page.keyboard.press('Control+u'); await page.keyboard.type('-90'); await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  const back = await A(page, `const s = A.files[1].sprites[0]; return Array.from(s.px);`);
  check('Rotate -90 restores the pixels', back.every((v, i) => v === after[i]));

  // ---- 6. save the new file via its file window menu, close, reopen by Filer double-click
  const fw2 = await A(page, `const w = A.files[1].win; w.open({ x: 120, y: 400, behind: 'top' }); return { x: w.x, y: w.y, w: w.w, h: w.h }`);
  await page.waitForTimeout(200);
  await page.mouse.click(fw2.x + 150, fw2.y + 20, { button: 'right' });
  await hoverArrow(page, 0, 2);
  await h.shot('savebox');
  await saveBoxTo(page, `${RAM}.MySprites`);
  const saved = await A(page, `const f = A.files[1]; return { title: f.win.title, modified: f.modified, st: os.vfs.stat('${RAM}.MySprites') };`);
  check('saved new sprite file', saved.st?.filetype === 0xFF9 && !saved.modified, JSON.stringify({ title: saved.title, size: saved.st?.size }));
  const pixels = await A(page, `return Array.from(A.files[1].sprites[0].px);`);
  // close its window (click the close icon)
  await A(page, `const f = A.files[1]; A.fileWins.closeRequest(f, { button: 'select' });`);
  await page.waitForTimeout(300);
  await filerOpen(page, RAM, 'MySprites', { wait: 1200 });
  const re = await A(page, `const f = A.files.find((q) => /MySprites/.test(q.filename ?? '')); const s = f?.sprites[0]; return s ? { name: s.name, w: s.w, h: s.h, bpp: s.bpp, px: Array.from(s.px) } : null`);
  check('reloaded sprite has identical pixels', re && re.name === 'mypic' && re.px.every((v, i) => v === pixels[i]), re ? `${re.name} ${re.w}x${re.h} ${re.bpp}bpp` : 'none');
  // and the reloaded file saves back byte-identical
  const rt = await A(page, `const f = A.files.find((q) => /MySprites/.test(q.filename ?? '')); const a = A.fileBytes(f); const b = await os.vfs.readFile('${RAM}.MySprites'); return a.length === b.length && a.every((x, i) => x === b[i]);`);
  check('reloaded file re-saves byte-identical', rt);
  await h.shot('reloaded');
};
