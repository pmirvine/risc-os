// node tests/paint/pw.mjs tests/paint/act-tools2.mjs
// Every Paint tool driven with the mouse, and every sprite-menu operation, on 16-colour, 256-colour
// and 16M-colour sprites; checks that each one changes the sprite and raises no errors.
import { check } from '../edit/ui.mjs';

const A = (page, body, arg) => page.evaluate(`(async (arg) => { const t = os.apps.tasksOf('Paint')[0]; const A = t?.paint; ${body} })(${JSON.stringify(arg ?? null)})`);

export default async (page, h) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await h.start();
  for (const [mode, label] of [[27, '16'], [28, '256'], [((6 << 27) | (90 << 14) | (90 << 1) | 1) >>> 0, '16M']]) {
    const geo = await A(page, `const { newSprite } = await import('/src/apps/Paint/spritefile.js'); const f = A.makeFile(); A.fileWins.create(f, { open: true });
      const s = newSprite({ name: 'test', w: 48, h: 40, mode: arg, mask: true }); A.attach(s, f); f.sprites.push(s); A.fileWins.layout(f, true);
      const sw = A.spriteWins.open(s); A.dialogs.setZoom(sw, 6, 1); sw.win.open({ x: 40, y: 40, w: 300, h: 250, behind: 'top' });
      A.toolWin.display(false); A.toolWin.win.open({ x: 600, y: 360, behind: 'top' });
      const cw = s.st.colourWin; cw?.win?.open?.({ x: 600, y: 40, behind: 'top' });
      return { x: sw.win.x, y: sw.win.y }`, mode);
    // choose a non-white colour
    await A(page, `const s = A.files.at(-1).sprites[0]; s.st.gcol = s.bpp > 8 ? 0xFF : 3;`);
    const P = (px, py) => ({ x: geo.x + px * 6 + 3, y: geo.y + py * 6 + 3 });
    const count = () => A(page, `const s = A.files.at(-1).sprites[0]; let n = 0; const white = s.px[s.px.length - 1]; for (const v of s.px) if (v !== white) n++; return n;`);
    const snap = () => A(page, `return Array.from(A.files.at(-1).sprites[0].px).join(',') + '|' + Array.from(A.files.at(-1).sprites[0].mask ?? []).join('');`);
    const pick = async (name) => { const p = await A(page, `const { TOOLARRAY } = await import('/src/apps/Paint/tools.js'); const w = A.toolWin.win; const i = TOOLARRAY.indexOf(arg); const b = w.icons[i].bbox; return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);`, name); await page.mouse.click(p.x, p.y); await page.waitForTimeout(100); };
    const click = async (x, y, opts) => { const p = P(x, y); await page.mouse.click(p.x, p.y, opts); await page.waitForTimeout(60); };
    const drag = async (a, b) => { const p = P(...a), q = P(...b); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(100); };
    const seqs = {
      pixel: async () => drag([1, 1], [10, 3]),
      spray: async () => { const p = P(20, 20); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(250); await page.mouse.up(); },
      line: async () => { await click(2, 5); await click(30, 9); },
      rectangleOutline: async () => { await click(3, 12); await click(12, 18); },
      rectangle: async () => { await click(14, 12); await click(20, 18); },
      parallelogramOutline: async () => { await click(22, 12); await click(28, 12); await click(30, 18); },
      parallelogram: async () => { await click(32, 12); await click(38, 12); await click(40, 18); },
      triangle: async () => { await click(2, 22); await click(10, 22); await click(6, 30); },
      circleOutline: async () => { await click(16, 26); await click(20, 26); },
      circle: async () => { await click(26, 26); await click(29, 26); },
      ellipseOutline: async () => { await click(36, 26); await click(41, 26); await click(41, 29); },
      ellipse: async () => { await click(8, 35); await click(12, 35); await click(12, 37); },
      arc: async () => { await click(20, 35); await click(24, 35); await click(20, 31); },
      segment: async () => { await click(30, 35); await click(34, 35); await click(30, 31); },
      sector: async () => { await click(40, 35); await click(44, 35); await click(40, 31); },
      fill: async () => { await click(46, 2); },
      camera: async () => { await drag([0, 0], [12, 10]); await click(30, 28); },
      scissor: async () => { await drag([2, 22], [10, 30]); await click(2, 2); },
      grabber: async () => { await drag([10, 10], [14, 12]); },
      text: async () => { await page.keyboard.type('Ab'); await click(24, 1); },
      brush: async () => { await click(8, 8); },
    };
    for (const [name, fn] of Object.entries(seqs)) {
      const before = await snap();
      await pick(name);
      await fn();
      const after = await snap();
      check(`${label} colours: ${name}`, before !== after);
    }
    await h.shot(`tools-${label}`);
    // every sprite-menu operation through the menu model (actions / writable submenus / dboxes)
    const res = await A(page, `
      const s = A.files.at(-1).sprites[0], sw = s.st.windows[0], SW = A.spriteWins, out = [];
      const menu = SW.menu(sw);
      const find = (m, t) => m.items.find((i) => (i.text ?? '').startsWith(t));
      const sub = (it) => typeof it.submenu === 'function' ? it.submenu() : it.submenu;
      const sig = () => s.w + 'x' + s.h + ':' + Array.from(s.px).slice(0, 400).join('') + (s.mask ? 'M' : '') + (s.pal ? 'P' + s.pal.length : '');
      const run = (label, fn) => { const a = sig(); try { fn(); out.push([label, sig() !== a, '']); } catch (e) { out.push([label, false, e.message]); } };
      const edit = sub(find(menu, 'Edit'));
      const act = (t) => find(edit, t).action({});
      const wr = (t, v) => { const m = sub(find(edit, t)); m.items[0].writable.value = v; m.items[0].action({ value: v }); };
      run('flipV', () => act('Flip vertically'));
      run('flipH', () => act('Flip horizontally'));
      run('rotate 45', () => wr('Rotate', '45'));
      run('scale x 1.5', () => wr('Scale x', '1.5'));
      run('scale y 0.5', () => wr('Scale y', '0.5'));
      run('shear 0.3', () => wr('Shear', '0.3'));
      run('mask off', () => act('Mask'));
      run('mask on', () => act('Mask'));
      if (s.bpp <= 8) { run('palette toggle', () => act('Palette')); run('palette toggle back', () => act('Palette')); }
      // Adjust size dialogue: type new size and press OK
      const box = sub(find(edit, 'Adjust size'));
      box.icons[6].setText('20'); box.icons[7].setText('16');
      run('adjust size 20x16', () => box.emit('click', { button: 'select', icon: box.icons[0] }));
      // insert / delete rows and columns (How many? box)
      for (const [t, n] of [['Insert columns', '3'], ['Insert rows', '2'], ['Delete columns', '1'], ['Delete rows', '1']]) {
        SW.lastCell = { sw, x: 2, y: 2 };
        const b = sub(find(edit, t)); b.icons[0].setText(n);
        run(t, () => SW.insdel.perform(n));
      }
      // Paint > Small colours, Select colour
      const paint = sub(find(menu, 'Paint'));
      try { find(paint, 'Small colours').action({}); find(paint, 'Small colours').action({}); out.push(['small colours', true, '']); } catch (e) { out.push(['small colours', false, e.message]); }
      return out;`);
    for (const [l, ok, e] of res) check(`${label} colours: menu ${l}`, ok, e);
    await h.shot(`ops-${label}`);
    await A(page, `const f = A.files.at(-1); f.modified = false; A.fileWins.destroy(f);`);
  }
  check('no page errors', errs.length === 0, errs.join(' / '));
};
