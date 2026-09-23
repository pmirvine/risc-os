// PhotoView functional checks (prints PASS/FAIL lines). Run with shot.sh div-photoview-check tests/div/photoview-check.mjs
export default async (page) => {
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  const r = await page.evaluate(async () => {
    const out = [];
    const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    // ChangeFSI's !Boot must not take the JPEG run action away (Utilities opened = Filer_Boot)
    os.filer.openDir('ADFS::HardDisc4.$.Utilities');
    await sleep(1500);
    ok(/PhotoView/.test(os.sysvars.get('Alias$@RunType_C85') ?? ''), 'Alias$@RunType_C85 after Filer_Boot of Utilities: ' + os.sysvars.get('Alias$@RunType_C85'));
    await os.filer.run('ADFS::HardDisc4.$.Images.50-99.sa51');
    await sleep(2000);
    const t = os.apps.tasksOf('PhotoView')[0];
    ok(!!t, 'double-click JPEG starts PhotoView');
    const pv = t.photoview;
    ok(pv.images.length === 1 && pv.images[0].win.title === 'sa51', 'image window opened: ' + pv.images.map((i) => i.win.title));
    // already running: DataOpen from a second double-click
    await os.filer.run('ADFS::HardDisc4.$.Images.50-99.sa52');
    await sleep(1500);
    ok(pv.images.length === 2 && os.apps.tasksOf('PhotoView').length === 1, 'second JPEG opens in the same task');
    // save as sprite (32 bpp)
    const { decodeSpriteFile } = await import('/src/core/spritefile.js');
    const b32 = pv.spriteFile(pv.images[0].pic, 'sa51');
    os.vfs.writeFile('RAM::RamDisc0.$.pv32', b32, { filetype: 0xFF9 });
    const s32 = decodeSpriteFile(os.vfs.readFileSync ? await os.vfs.readFile('RAM::RamDisc0.$.pv32') : b32)[0];
    ok(s32 && s32.width === 768 && s32.height === 512, `32bpp sprite decodes ${s32?.width}x${s32?.height} name ${s32?.name}`);
    // grey palette, Base/4 resolution, rotate 90
    const im = await pv.openImage('ADFS::HardDisc4.$.Images.00-49.sa05', { resolution: 2, orientation: 1, palette: 4, dither: true });
    ok(im && im.pic.w === 256 && im.pic.h === 384, `Base/4 rotated 90: ${im?.pic.w}x${im?.pic.h}`);
    const sg = decodeSpriteFile(pv.spriteFile(im.pic, 'sa05'))[0];
    ok(sg && sg.width === 256 && sg.height === 384, `8-grey sprite decodes ${sg?.width}x${sg?.height}`);
    const px = sg.rgba; const greys = new Set();
    for (let i = 0; i < px.length; i += 4) { if (px[i] !== px[i + 1] || px[i] !== px[i + 2]) { greys.add('colour'); break; } greys.add(px[i]); }
    ok(!greys.has('colour') && greys.size <= 8, 'sprite uses <= 8 greys: ' + greys.size);
    // standard save box writes a sprite file
    const box = (await import('/src/core/dialogs.js')).saveAs({ task: t, filename: 'x', filetype: 0xFF9, getData: async () => pv.spriteFile(im.pic, 'sa05') });
    box.icons[1].setText('RAM::RamDisc0.$.Spritefile');
    box.open({ behind: 'top' });
    const okIcon = box.icons[0];
    box.emit('click', { button: 'select', buttons: 4, icon: okIcon, iconIndex: 0, x: 0, y: 0 });
    await sleep(500);
    const st = os.vfs.stat('RAM::RamDisc0.$.Spritefile');
    ok(st && st.filetype === 0xFF9, 'save box wrote Spritefile type ' + st?.filetype?.toString(16));
    // icon bar drop of a directory adds it to Source and opens its overview
    const it = os.wimp.iconbar.items.find((i) => i.task === t);
    it.onDataLoad({ files: [{ path: 'ADFS::HardDisc4.$.Images.Team', filetype: 0x1000 }] });
    await sleep(1500);
    ok(pv.overviews.some((o) => /Team$/.test(o.path)), 'drop directory -> overview ' + pv.overviews.map((o) => o.path));
    ok(pv.overviews[0].slides.some((s) => s.state === 2), 'thumbnails decoded lazily: ' + pv.overviews[0].slides.filter((s) => s.state === 2).length + '/' + pv.overviews[0].slides.length);
    // widening an overview re-flows the slides into more columns (overvw_event_handler EOPEN)
    const ov = pv.openOverview('ADFS::HardDisc4.$.Images.00-49');
    ov.win.requestOpen({ w: 8 + 6 * 136, behind: 'keep' });
    await sleep(300);
    ok(ov.columns === 6 && ov.slides[6].frame.bbox.y0 === 144, 'resize -> columns ' + ov.columns);
    return out.join('\n');
  });
  console.log(r);
};
