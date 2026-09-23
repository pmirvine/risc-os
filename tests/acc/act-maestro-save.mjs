// Maestro: load a tune, save it via the Save box (type a full path + OK), reload it and compare.
export default async (page) => {
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Sound.Fanfare'));
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    const t = os.apps.tasksOf('Maestro')[0];
    const { saveMaestro } = await import('/src/apps/Maestro/format.js');
    const a = saveMaestro(t.maestro.doc);
    os.vfs.writeFile('RAM::RamDisc0.$.Tune', a, { filetype: 0xAF1 });
    await t.maestro.loadFile('RAM::RamDisc0.$.Tune');
    const b = saveMaestro(t.maestro.doc);
    const orig = await os.vfs.readFile('ADFS::HardDisc4.$.Sound.Fanfare');
    return { same: a.length === b.length && a.every((x, i) => x === b[i]), origSame: orig.length === a.length && orig.every((x, i) => x === a[i]), type: os.vfs.stat('RAM::RamDisc0.$.Tune').filetype.toString(16) };
  });
  console.log('save', JSON.stringify(r));
  await page.evaluate(() => os.apps.tasksOf('Maestro')[0].maestro.gotoBar(10));
  await page.waitForTimeout(400);
};
