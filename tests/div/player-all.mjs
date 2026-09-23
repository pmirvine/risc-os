// !Player: drop every sound file in Diversions.AudioDemos on the icon bar icon and read back the
// length / description icons of the Player window. Prints a JSON table; screenshot = last file.
//   sh shot.sh div-player-all tests/div/player-all.mjs
export default async (page) => {
  await page.evaluate(async () => { await os.apps.start('!Player'); });
  await page.waitForTimeout(800);
  const files = await page.evaluate(() => os.vfs.list('ADFS::HardDisc4.$.Diversions.AudioDemos').filter((f) => f.filetype !== 0xFFF).map((f) => ({ path: f.path, filetype: f.filetype, name: f.name })));
  const out = [];
  for (const f of files) {
    await page.evaluate((f) => {
      const it = os.wimp.iconbar.items.find((i) => i.task?.name === 'Player for sample data');
      it.onDataLoad({ files: [{ path: f.path, filetype: f.filetype, type: 'file' }] });
    }, f);
    await page.waitForTimeout(700);
    out.push(await page.evaluate((f) => {
      const w = [...os.wimp.windows].find((w) => w.name?.toLowerCase() === 'player');
      const err = [...os.wimp.windows].find((w) => w.isOpen && /^Message from|^Error/.test(w.title));
      return { name: f.name, type: f.filetype.toString(16), title: w.title, length: w.icons[15].text, desc: w.icons[16].text, error: err ? err.icons.map((i) => i.text).filter(Boolean).join(' | ') : null };
    }, f));
    // dismiss any error box
    await page.keyboard.press('Escape');
  }
  console.log('PLAYER-ALL ' + JSON.stringify(out, null, 1));
};
