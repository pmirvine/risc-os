// Squash a directory: drop a dir, choose Squash, OK to a new dir name; check the contents.
export default async (page) => {
  await page.evaluate(() => os.apps.start('Squash'));
  await page.waitForTimeout(700);
  await page.mouse.move(912, 740);
  await page.evaluate(() => { const v = os.vfs; v.mkdir('RAM::RamDisc0.$.Docs'); v.writeFile('RAM::RamDisc0.$.Docs.A', 'hello world '.repeat(200), { filetype: 0xFFF }); v.writeFile('RAM::RamDisc0.$.Docs.B', 'tiny', { filetype: 0xFFF }); v.mkdir('RAM::RamDisc0.$.Docs.!App'); v.writeFile('RAM::RamDisc0.$.Docs.!App.!Run', 'x'.repeat(500), { filetype: 0xFEB }); });
  await page.evaluate(() => os.apps.tasksOf('Squash')[0].squash.drop([{ path: 'RAM::RamDisc0.$.Docs' }]));
  await page.waitForTimeout(400);
  if (process.env.STEP === 'box') return;
  await page.keyboard.press('Control+u');
  await page.keyboard.type('RAM::RamDisc0.$.DocsSq');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  console.log('DIR', JSON.stringify(await page.evaluate(() => ['A', 'B', '!App.!Run'].map((n) => { const s = os.vfs.stat('RAM::RamDisc0.$.DocsSq.' + n); return n + ':' + (s ? s.filetype.toString(16) + '/' + s.size : 'missing'); }))));
};
