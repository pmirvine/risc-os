// Seed disc: double-click one file of each type in Images, Sound, Tutorials, Manuals, Diversions and report
// which task / window it opened (or the error box). node tests/core/shot.mjs div-filetypes tests/div/filetypes-route.mjs
const FILES = [
  'Images.00-49.sa03', 'Images.ReadMe', 'Images.!SlideShow',
  'Sound.Fanfare', 'Sound.1812',
  'Tutorials.DrawTutor.Map', 'Tutorials.DrawTutor.Horse', 'Tutorials.PaintTutor.Flower', 'Tutorials.StarComms',
  'Tutorials.WelcomeGde.DrawDemo', 'Tutorials.ReadMe',
  'Manuals.Manual.BOOKB.TOC/HTM', 'Manuals.Manual.BOOK1B.CONTENT', 'Manuals.AppNote',
  'Diversions.AudioDemos.Blues', 'Diversions.AudioDemos.Blast', 'Diversions.ReadMe', 'Diversions.Desktop',
];
export default async (page) => {
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.evaluate(async () => {
    for (const d of ['Images', 'Sound', 'Tutorials', 'Manuals', 'Diversions', 'Apps', 'Utilities']) os.filer.openDir('ADFS::HardDisc4.$.' + d);
    await new Promise((r) => setTimeout(r, 2500));
  });
  const aliases = await page.evaluate(() => Object.fromEntries(['C85', 'AF1', 'AE7', 'AFF', 'FF9', 'FFF', 'FAF', '695', 'FB1', 'FED', 'FEB'].map((t) => [t, os.sysvars.get('Alias$@RunType_' + t) ?? null])));
  console.log('ALIASES', JSON.stringify(aliases, null, 1));
  for (const f of FILES) {
    const before = await page.evaluate(() => ({ tasks: os.wimp.tasks.map((t) => t.name), wins: [...os.wimp.windows].filter((w) => w.isOpen).map((w) => w.title) }));
    await page.evaluate((p) => { os.filer.run('ADFS::HardDisc4.$.' + p); }, f);
    await page.waitForTimeout(f.includes('SlideShow') ? 1500 : 2500);
    const after = await page.evaluate(() => ({ tasks: os.wimp.tasks.map((t) => t.name), wins: [...os.wimp.windows].filter((w) => w.isOpen).map((w) => w.title), overlay: !!document.querySelector('.screen-overlay, .acquired') }));
    const newT = after.tasks.filter((t) => !before.tasks.includes(t));
    const newW = after.wins.filter((t) => !before.wins.includes(t));
    console.log('RUN', f.padEnd(34), '| new tasks:', newT.join(',') || '-', '| new windows:', newW.join(' / ') || '-');
    if (f.includes('SlideShow')) { await page.keyboard.press('Escape'); await page.waitForTimeout(800); }
    // close any error box
    const err = after.wins.find((t) => /^(Error|Message from)/.test(t));
    if (err) { await page.keyboard.press('Enter'); await page.waitForTimeout(300); }
  }
};
