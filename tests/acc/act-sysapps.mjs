// Double-click !System, !Scrap, !Fonts (via Filer run) and report any error boxes.
export default async (page) => {
  for (const a of ['!System', '!Scrap', '!Fonts']) {
    await page.evaluate((a) => os.filer.run('ADFS::HardDisc4.$.!Boot.Resources.' + a), a);
    await page.waitForTimeout(700);
    const t = await page.evaluate(() => [...document.querySelectorAll('.win')].filter((w) => w.offsetParent && /Message from|Error/.test(w.textContent)).map((w) => w.textContent.slice(0, 200)));
    console.log(a, JSON.stringify(t));
    await page.keyboard.press('Enter');
    console.log(await page.evaluate(() => ['System$Path', 'Wimp$Scrap', 'Font$Path'].map((v) => v + '=' + os.sysvars.get(v)).join(' ')));
  }
};
