// Squash: write a text file, drop it on the icon (Save box appears), OK -> squashed file; then
// drop the squashed file -> Save box with the Text icon -> OK -> decompressed copy.
export default async (page) => {
  await page.evaluate(() => os.apps.start('Squash'));
  await page.waitForTimeout(700);
  await page.mouse.move(912, 740);
  await page.evaluate(() => os.vfs.writeFile('RAM::RamDisc0.$.Letter', 'Dear Sir,\n'.repeat(300), { filetype: 0xFFF }));
  await page.evaluate(() => os.apps.tasksOf('Squash')[0].squash.drop([{ path: 'RAM::RamDisc0.$.Letter' }]));
  await page.waitForTimeout(400);
  if (process.env.STEP === 'box') return;
  // type a new name + Return
  await page.keyboard.press('Control+u');
  await page.keyboard.type('RAM::RamDisc0.$.LetterSq');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const a = await page.evaluate(() => { const s = os.vfs.stat('RAM::RamDisc0.$.LetterSq'); return s && { type: s.filetype.toString(16), size: s.size }; });
  console.log('SQUASHED', JSON.stringify(a));
  await page.evaluate(() => os.apps.tasksOf('Squash')[0].squash.drop([{ path: 'RAM::RamDisc0.$.LetterSq' }]));
  await page.waitForTimeout(400);
  if (process.env.STEP === 'box2') return;
  await page.keyboard.press('Control+u');
  await page.keyboard.type('RAM::RamDisc0.$.Letter2');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const b = await page.evaluate(async () => { const s = os.vfs.stat('RAM::RamDisc0.$.Letter2'); return s && { type: s.filetype.toString(16), size: s.size, same: (await os.vfs.readText('RAM::RamDisc0.$.Letter2')) === 'Dear Sir,\n'.repeat(300) }; });
  console.log('UNSQUASHED', JSON.stringify(b));
  await page.evaluate(() => os.filer.openDir('RAM::RamDisc0.$', { x: 300, y: 200 }));
  await page.waitForTimeout(500);
};
