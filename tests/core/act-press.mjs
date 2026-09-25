// Press effect (*Configure WimpPress, RISC OS 4 style; on by default): an R5/R6 action icon is drawn
// pressed while a button is held on it and released afterwards; off, nothing changes. Also !Alarm's
// digital icon bar clock has its PROCprepare_icon frame (dark blue, light blue, white).
const P = (ok, what, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${what} ${extra}`);
export default async (page) => {
  await page.evaluate(() => os.apps.start('Configure')); await page.waitForTimeout(1500);
  const soundBtn = await page.evaluate(() => { const w = [...os.wimp.windows].find((w) => w.isOpen && w.title === 'Configuration'); const ic = w.icons.find((i) => i?.text === 'Sound'); const r = ic.el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(soundBtn.x, soundBtn.y); await page.waitForTimeout(800);
  const arrow = () => page.evaluate(() => { const w = [...os.wimp.windows].find((w) => w.isOpen && w.icons.some((i) => i?.validation?.includes('Sup,pup'))); w.open({ behind: 'top' }); const ic = w.icons.find((i) => i?.validation?.includes('Sup,pup')); const r = ic.el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, pressed: !!ic._pressed, sprite: ic.el.querySelector('img')?.src.split('/').pop() }; });
  let a = await arrow();
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.waitForTimeout(100);
  let b = await arrow();
  P(b.pressed && b.sprite === 'pup.png', 'held arrow drawn pressed with its pup sprite', b.sprite);
  await page.mouse.up(); await page.waitForTimeout(100);
  b = await arrow();
  P(!b.pressed && b.sprite === 'up.png', 'released arrow back to normal', b.sprite);
  await page.evaluate(() => os.config.set('WimpPress', 'Off')); await page.evaluate(() => os.config.apply());
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.waitForTimeout(100);
  b = await arrow();
  P(!b.pressed && b.sprite === 'up.png', 'no press effect with *Configure WimpPress Off', b.sprite);
  await page.mouse.up();
  await page.evaluate(() => { os.config.set('WimpPress', 'On'); os.config.apply(); });
  // !Alarm digital clock frame
  await page.evaluate(() => os.apps.start('Alarm')); await page.waitForTimeout(1500);
  const px = await page.evaluate(() => {
    const i = os.wimp.iconbar.items.find((i) => /alarm/i.test(i.task?.name ?? ''));
    const img = i.icon.el.querySelector('img'); const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const at = (x, y) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join('');
    const k = img.naturalWidth / img.getBoundingClientRect().width;
    return [at(1 * k, 17 * k), at(3 * k, 17 * k), at(6 * k, 6 * k)];
  });
  P(px[0] === '004499' && px[1] === '00bbff' && px[2] === 'ffffff', 'Alarm digital clock: dark blue, light blue, white frame', px.join(' '));
};
