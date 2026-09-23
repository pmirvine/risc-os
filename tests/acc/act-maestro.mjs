// Maestro: double-click a tune in HardDisc4.Sound (STEP=load|play|instr|menu|edit)
export default async (page) => {
  const step = process.env.STEP || 'load';
  const tune = process.env.TUNE || 'Gigue';
  await page.evaluate((t) => os.filer.run('ADFS::HardDisc4.$.Sound.' + t), tune);
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => { const t = os.apps.tasksOf('Maestro')[0]; if (!t) return 'no task'; const d = t.maestro.doc; return { items: d.items.length, staves: d.staves, tempo: d.tempo }; });
  console.log('loaded', JSON.stringify(info));
  const T = () => page.evaluate(() => os.apps.tasksOf('Maestro')[0]);
  if (step === 'play') {
    await page.evaluate(() => os.apps.tasksOf('Maestro')[0].maestro.togglePlay());
    await page.waitForTimeout(4000);
    console.log('playing', await page.evaluate(() => { const p = os.apps.tasksOf('Maestro')[0].maestro.player; return { playing: p.playing, pos: p.position.toFixed(2), events: p.events?.length }; }));
  } else if (step === 'menu' || step === 'instr') {
    const w = await page.evaluate(() => { const s = [...os.apps.tasksOf('Maestro')[0].windows].find((x) => x.hasFlag?.(1 << 26) || x.title?.length); return { x: s.x, y: s.y, w: s.w, h: s.h }; });
    await page.mouse.click(w.x + 300, w.y + 120, { button: 'right' });
    await page.waitForTimeout(300);
    const it = page.locator('.menu .mitem', { hasText: step === 'instr' ? 'Instruments' : 'Tempo' }).first();
    const b = await it.boundingBox();
    await page.mouse.move(b.x + b.width - 5, b.y + b.height / 2, { steps: 4 });
    await page.waitForTimeout(500);
  } else if (step === 'edit') {
    await page.evaluate(() => os.apps.tasksOf('Maestro')[0].maestro.selectPalette({ pane: 'note', i: 3 }));
    const w = await page.evaluate(() => { const s = [...os.apps.tasksOf('Maestro')[0].windows].find((x) => /Gigue|untitled/.test(x.title)); return { x: s.x, y: s.y }; });
    await page.mouse.click(w.x + 90, w.y + 95);
    await page.waitForTimeout(400);
    console.log('after edit', await page.evaluate(() => os.apps.tasksOf('Maestro')[0].maestro.doc.items.length));
  }
};
