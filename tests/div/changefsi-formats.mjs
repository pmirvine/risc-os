// ChangeFSI: load a GIF (Manuals), a PNG (made in the page, written to RAM disc), a sprite
// (Tutorials.PaintTutor.Flower) and a JPEG; for each check that a picture window opens without an
// error box, then save the sprite output through the Save box and check the file.
// Screenshot: the last one (sprite source). Prints a JSON summary.
//   sh shot.sh div-changefsi-formats tests/div/changefsi-formats.mjs
const GIF = 'ADFS::HardDisc4.$.Manuals.Manual.INDEX';
async function loadInto(page, path, filetype) {
  await page.evaluate(({ path, filetype }) => {
    const it = os.wimp.iconbar.items.find((i) => i.task?.name === 'ChangeFSI');
    it.onDataLoad({ files: [{ path, filetype }] });
  }, { path, filetype });
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    const ws = [...os.wimp.windows].filter((w) => w.isOpen);
    const pic = ws.find((w) => w.task?.name === 'ChangeFSI' && w.useCanvas && /[.$]/.test(w.title) && w.title !== 'Sprite Output');
    const err = ws.find((w) => /^Message from|^Error/.test(w.title));
    return { pic: pic ? { title: pic.title, w: pic.extent.x1 - pic.extent.x0, h: pic.extent.y1 - pic.extent.y0 } : null, error: err ? err.icons.map((i) => i.text).join(' | ') : null };
  });
}
export default async (page) => {
  const out = {};
  await page.evaluate(async () => { await os.apps.start('ChangeFSI'); });
  await page.waitForTimeout(500);
  // a GIF from the manuals
  const gifPath = await page.evaluate(() => {
    const walk = (d) => { for (const f of os.vfs.list(d)) { if (f.type === 'dir') { const r = walk(f.path); if (r) return r; } else if (f.filetype === 0x695) return f.path; } return null; };
    return walk('ADFS::HardDisc4.$.Manuals.Manual.BOOK1B');
  });
  out.gif = { path: gifPath, ...(await loadInto(page, gifPath, 0x695)) };
  // a PNG made here
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 120; c.height = 80;
    const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 120, 0);
    gr.addColorStop(0, '#f00'); gr.addColorStop(0.5, '#0f0'); gr.addColorStop(1, '#00f');
    g.fillStyle = gr; g.fillRect(0, 0, 120, 80); g.fillStyle = '#fff'; g.fillRect(30, 20, 60, 40);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    os.vfs.writeFile('RAM::RamDisc0.$.TestPNG', new Uint8Array(await blob.arrayBuffer()), { filetype: 0xB60 });
  });
  out.png = await loadInto(page, 'RAM::RamDisc0.$.TestPNG', 0xB60);
  out.jpeg = await loadInto(page, 'ADFS::HardDisc4.$.Images.00-49.sa10', 0xC85);
  out.sprite = await loadInto(page, 'ADFS::HardDisc4.$.Tutorials.PaintTutor.Flower', 0xFF9);
  // save the sprite output: picture menu -> Save image -> path + OK
  const w = await page.evaluate(() => { const w = [...os.wimp.windows].find((x) => x.isOpen && /Flower/.test(x.title)); const s = os.wimp.scale || 1; return { x: (w.x + 40) * s, y: (w.y + 40) * s }; });
  await page.mouse.click(w.x, w.y, { button: 'middle' });
  await page.waitForTimeout(300);
  const item = await page.evaluate(() => { const e = [...document.querySelectorAll('.layer-menus *')].find((x) => x.textContent === 'Save image' && !x.children.length); const r = e.getBoundingClientRect(); return { x: r.x + 5, y: r.y + r.height / 2 }; });
  await page.mouse.move(item.x, item.y);
  await page.mouse.move(item.x + 160, item.y, { steps: 5 });
  await page.waitForTimeout(500);
  const ok = await page.evaluate(() => {
    const sv = [...os.wimp.windows].find((x) => x.isOpen && x.title === 'Save as');
    if (!sv) return null;
    sv.icons[1].setText('RAM::RamDisc0.$.FlowerOut');
    const b = sv.icons[0].bbox; const p = sv.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); const s = os.wimp.scale || 1;
    return { x: p.x * s, y: p.y * s };
  });
  if (ok) { await page.mouse.click(ok.x, ok.y); await page.waitForTimeout(800); }
  out.saved = await page.evaluate(async () => {
    const st = os.vfs.stat('RAM::RamDisc0.$.FlowerOut');
    if (!st) return null;
    const b = await os.vfs.readFile(st.path);
    const dv = new DataView(b.buffer, b.byteOffset);
    const name = String.fromCharCode(...b.subarray(16, 28)).replace(/\0.*$/, '');
    return { filetype: st.filetype.toString(16), size: st.size, count: dv.getUint32(0, true), first: name, wordsW: dv.getUint32(28, true) + 1, h: dv.getUint32(32, true) + 1, mode: dv.getUint32(52, true).toString(16) };
  });
  console.log('CFSI-FORMATS ' + JSON.stringify(out, null, 1));
};
