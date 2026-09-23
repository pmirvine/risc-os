// Start Printers; open Printer control, configure, connections, queue; icon bar menu. STEP env selects the view.
const ibPos = (page) => page.evaluate(() => { const t = os.apps.tasksOf('Printers')[0]; const it = [...t.iconbarIcons][0]; const r = it.icon.el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 12 }; });
export default async (page) => {
  await page.evaluate(() => localStorage.removeItem('riscos371.printers'));
  await page.evaluate(() => os.apps.start('Printers'));
  await page.waitForTimeout(800);
  const step = process.env.STEP || 'control';
  const pos = await ibPos(page);
  if (step === 'menu') {
    await page.mouse.click(pos.x, pos.y, { button: 'right' });
    await page.waitForTimeout(300);
    const it = await page.locator('.menu .mitem').nth(0).boundingBox();
    await page.mouse.move(it.x + it.width - 6, it.y + 10, { steps: 4 });
    await page.waitForTimeout(500);
    return;
  }
  if (step === 'control') {
    await page.evaluate(() => os.printers.open());
    await page.evaluate(() => os.printers.printers.length);
    // install a second printer from its definition file
    await page.evaluate(async () => { const t = os.apps.tasksOf('Printers')[0]; t.emit('run', { file: 'ADFS::HardDisc4.$.Printing.Printers.HP.DJ500C' }); });
    await page.waitForTimeout(800);
    await page.evaluate(() => os.printers.open());
    await page.waitForTimeout(300);
  }
  if (step === 'configure') { await page.keyboard.down('Control'); await page.mouse.click(pos.x, pos.y); await page.keyboard.up('Control'); await page.waitForTimeout(500); }
  if (step === 'connections') { await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.mouse.click(pos.x, pos.y); await page.keyboard.up('Shift'); await page.keyboard.up('Control'); await page.waitForTimeout(500); }
  if (step === 'queue') {
    const popup = page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await page.evaluate(() => { os.printers.print({ title: 'Test page', text: 'Hello from RISC OS 3.71\nSecond line' }); });
    await page.waitForTimeout(100);
    const pp = await popup;
    if (pp) { await pp.waitForTimeout(800); await pp.screenshot({ path: 'tests/screens/acc-printers-output.png' }); console.log('popup title', await pp.title()); }
  }
};
