export default async (page) => {
  await page.evaluate(async () => {
    const t = wimp.createTask('Gallery');
    const area = await os.sprites.loadManifest('Draw', 'Sprites');
    const w = await t.createWindowFromTemplate('assets/templates/Draw.json', 'pane', { x: 40, y: 60, spriteArea: area });
    w.open({ behind: 'top' });
    const c = await t.createWindowFromTemplate('assets/templates/Configure.json', 'Main', { x: 200, y: 60, spriteArea: await os.sprites.loadManifest('Configure', 'Sprites22') });
    c.open({ behind: 'top' });
  });
  await page.waitForTimeout(800);
};
