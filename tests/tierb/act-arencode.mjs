// !AREncode / !ARWork ($.Replay): boot variables, launch from the Filer, load a movie, every window,
// compression reporting that the compressor can't start, Save choices. Screenshots tierB-arencode-*.png.
import path from 'path';
import { SHOTS } from '../core/pw.mjs';
import { filerOpen, check, menuTexts, hoverArrow, clickItem } from '../edit/ui.mjs';

const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, `tierB-arencode-${n}.png`) });
const icon = (page, win, i) => page.evaluate(({ win, i }) => {
  const w = os.apps.tasksOf('AREncode')[0].arencode.windows[win];
  const b = w.icons[i].bbox; return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
}, { win, i });
const errorText = (page) => page.evaluate(() => [...wimp.windows].filter((w) => w.isOpen && /Message from/.test(w.title ?? '')).map((w) => w.icons.map((i) => i?.text).join(' ')).join('|'));
const closeError = async (page) => { await page.keyboard.press('Enter'); await page.waitForTimeout(250); };

// a small uncompressed movie: type 2 (15 bit colour), 64x48 RGB, 12.5 fps, one 8 kHz sound track
const MOVIE = [
  'ARMovie', 'Students at Acorn World', '31st December 1993', 'Dick Wallin', '2 video format', '64 pixels', '48 pixels',
  '16 bits per pixel (RGB)', '12.5 frames per second', '1 sound format', '8000 Hz samples', '1 channels', '8 bits per sample linear signed',
  '25 frames per chunk', '1 number of chunks', '153600 even chunk size', '153600 odd chunk size', '400 offset to chunk catalogue',
  '0 offset to helpful sprite', '0 size of sprite (bytes)', '-1 offset to key frames',
].join('\n') + '\n';

export default async (page) => {
  const vars = () => page.evaluate(() => ({ armovie: os.sysvars.get('ARMovie$Dir'), arwork: os.sysvars.get('ARWork$Dir') }));
  check('ARMovie$Dir set by !Boot.Resources.!ARMovie', !!(await vars()).armovie, (await vars()).armovie);

  // !ARWork: double-click runs its Obey !Run (no program)
  await filerOpen(page, 'ADFS::HardDisc4.$.Replay', '!ARWork', { wait: 800 });
  check('!ARWork sets ARWork$Dir', /!ARWork\.Work$/i.test((await vars()).arwork ?? ''), (await vars()).arwork);
  check('!ARWork starts no task', !(await page.evaluate(() => wimp.tasks.some((t) => t.name === 'ARWork' && t.alive))));
  check('no ARM code error from !ARWork', !(await errorText(page)));

  await page.evaluate((t) => {
    const hdr = t.padEnd(400, ' ');
    const cat = '1000,153600;4000\n';
    const s = hdr + cat.padEnd(600, ' ');
    const b = new Uint8Array(1000 + 153600 + 4000);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    os.vfs.writeFile('RAM::RamDisc0.$.Film93', b, { filetype: 0xAE7 });
  }, MOVIE);

  // launch from the Filer
  await filerOpen(page, 'ADFS::HardDisc4.$.Replay', '!AREncode', { wait: 1500 });
  check('AREncode running', await page.evaluate(() => os.apps.tasksOf('AREncode').length === 1));
  check('icon bar icon', await page.evaluate(() => wimp.iconbar.items.some((i) => i.task?.name === 'AREncode')));
  check('no error on start', !(await errorText(page)), await errorText(page));

  // a sound-only movie can't be compressed (hdr3)
  await page.evaluate(() => os.apps.tasksOf('AREncode')[0].arencode.loadFiles([{ path: 'ADFS::HardDisc4.$.Diversions.AudioDemos.Blues' }]));
  await page.waitForTimeout(500);
  const e1 = await errorText(page);
  check('sound-only movie refused', /has no video and cannot be compressed/.test(e1), e1);
  await shot(page, 'novideo');
  await closeError(page);

  // drop the movie on the icon bar icon
  await page.evaluate(() => {
    const it = wimp.iconbar.items.find((i) => i.task?.name === 'AREncode');
    it.onDataLoad({ files: [{ path: 'RAM::RamDisc0.$.Film93', filetype: 0xAE7 }] });
  });
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => { const a = os.apps.tasksOf('AREncode')[0].arencode; const w = a.windows.ed; return { open: w.isOpen, name: w.icons[9].text, author: w.icons[11].text, compress: !w.icons[2].shaded, join: !w.icons[1].shaded }; });
  check('Compress window shows the header', st.open && st.name === 'Students at Acorn World' && st.author === 'Dick Wallin', JSON.stringify(st));
  check('Compress enabled, Join shaded', st.compress && !st.join);
  await page.mouse.move(10, 10);
  await shot(page, 'main');

  // window menu -> Movie setup dialogue
  const c = await icon(page, 'ed', 3);
  await page.mouse.click(c.x, c.y + 60, { button: 'right' });
  await page.waitForTimeout(300);
  const items = await menuTexts(page, 0);
  check('hdrmenu items', items.join('|').includes('Movie setup') && items.join('|').includes('Sound tracks'), items.join('|'));
  await shot(page, 'menu');
  await hoverArrow(page, 0, 3);
  await page.waitForTimeout(300);
  const cv = await page.evaluate(() => { const w = os.apps.tasksOf('AREncode')[0].arencode.windows.cv; return { open: w.isOpen, fps: w.icons[14].text, fpc: w.icons[20].text, len: w.icons[24].text }; });
  check('Movie setup values', cv.open && cv.fps === '12.5' && cv.fpc === '25' && cv.len === '50', JSON.stringify(cv));
  // divisor up: frames per chunk follow
  const up = await icon(page, 'cv', 17);
  await page.mouse.click(up.x, up.y);
  await page.waitForTimeout(200);
  const cv2 = await page.evaluate(() => { const w = os.apps.tasksOf('AREncode')[0].arencode.windows.cv; return { div: w.icons[16].text, fpc: w.icons[20].text }; });
  check('divisor 2 -> 12 frames per chunk (13)', cv2.div === '2' && /^1[23]$/.test(cv2.fpc), JSON.stringify(cv2));
  await shot(page, 'setup');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Configure compressor
  await page.mouse.click(c.x, c.y + 60, { button: 'right' });
  await page.waitForTimeout(300);
  await clickItem(page, 0, 4);
  await page.waitForTimeout(300);
  const cw = await page.evaluate(() => { const w = os.apps.tasksOf('AREncode')[0].arencode.windows.cw; return { open: w.isOpen, name: w.icons[33].text, size: !w.icons[27].deleted, lat: !w.icons[10].deleted }; });
  check('Configure compressor: Moving Lines, frame size mode', cw.open && cw.name === 'Moving Lines' && cw.size && !cw.lat, JSON.stringify(cw));
  await shot(page, 'compressor');
  const pop = await icon(page, 'cw', 34);
  await page.mouse.click(pop.x, pop.y);
  await page.waitForTimeout(300);
  const comps = await menuTexts(page, 0);
  check('compressor menu', comps.includes('Moving Blocks') && comps.includes('Moving Blocks HQ'), comps.join('|'));
  await shot(page, 'compmenu');
  await page.keyboard.press('Escape');
  const bw = await icon(page, 'cw', 9);
  await page.mouse.click(bw.x, bw.y);
  await page.waitForTimeout(200);
  check('Device bandwidth shows latency/data rate', await page.evaluate(() => { const w = os.apps.tasksOf('AREncode')[0].arencode.windows.cw; return !w.icons[10].deleted && !w.icons[16].deleted && w.icons[28].deleted; }));
  await shot(page, 'bandwidth');
  const ok = await icon(page, 'cw', 2);
  await page.mouse.click(ok.x, ok.y);
  await page.waitForTimeout(200);
  check('OK registers the mode', await page.evaluate(() => os.apps.tasksOf('AREncode')[0].arencode.opts.cmode === 'bandwidth'));

  // Filters: drag SharpenY into "In use"
  await page.mouse.click(c.x, c.y + 60, { button: 'right' });
  await page.waitForTimeout(300);
  await clickItem(page, 0, 5);
  await page.waitForTimeout(400);
  const fp = await page.evaluate(() => {
    const a = os.apps.tasksOf('AREncode')[0].arencode.windows;
    const it = a.paneA.items[1]; const b = it.bbox; const s = a.paneA.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    const d = a.paneB.workToScreen(40, 10);
    return { s, d, n: a.paneA.items.length };
  });
  check('Filters available', fp.n === 7, String(fp.n));
  await page.mouse.move(fp.s.x, fp.s.y); await page.mouse.down();
  await page.mouse.move(fp.s.x + 30, fp.s.y + 5, { steps: 4 }); await page.mouse.move(fp.d.x, fp.d.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const inUse = await page.evaluate(() => os.apps.tasksOf('AREncode')[0].arencode.windows.paneB.items.map((i) => i.data));
  check('filter dragged into In use', inUse.includes('SharpenY'), inUse.join(','));
  await shot(page, 'filters');
  const fok = await icon(page, 'fw', 0);
  await page.mouse.click(fok.x, fok.y);

  // Sound tracks
  await page.mouse.click(c.x, c.y + 60, { button: 'right' });
  await page.waitForTimeout(300);
  await clickItem(page, 0, 6);
  await page.waitForTimeout(400);
  const tr = await page.evaluate(() => { const w = os.apps.tasksOf('AREncode')[0].arencode.windows.tw; return { open: w.isOpen, file: w.icons[3].text, fmt: w.icons[5].text, desc: w.icons[23].text }; });
  check('Sound tracks show the movie track', tr.open && /Film93/.test(tr.file) && /8 bit signed linear/.test(tr.fmt) && /mono 8000Hz/.test(tr.desc), JSON.stringify(tr));
  await shot(page, 'tracks');
  const tu = await icon(page, 'tw', 0);
  await page.mouse.click(tu.x, tu.y);

  // multi-tasking compression: untick Single task, Compress -> summary + error
  const single = await icon(page, 'ed', 12);
  await page.mouse.click(single.x, single.y);
  await page.waitForTimeout(150);
  const comp = await icon(page, 'ed', 2);
  await page.mouse.click(comp.x, comp.y);
  await page.waitForTimeout(1300);
  const sum = await page.evaluate(() => { const a = os.apps.tasksOf('AREncode')[0].arencode; return { open: a.windows.sw.isOpen, log: a.log.join(' / ') }; });
  check('summary window opened', sum.open, sum.log);
  const e2 = await errorText(page);
  check('compressor unavailable reported', /Compressor could not initialise correctly/.test(e2), e2);
  check('work directory written', await page.evaluate(() => os.vfs.exists('<ARWork$Dir>.AREncode.Film93.Header') && os.vfs.exists('<ARWork$Dir>.AREncode.Film93.Sprite')));
  await shot(page, 'compress');
  await closeError(page);
  await shot(page, 'summary');
  const abort = await icon(page, 'sw', 2);
  await page.mouse.click(abort.x, abort.y);
  await page.waitForTimeout(300);
  check('Abort reopens the Compress window', await page.evaluate(() => { const a = os.apps.tasksOf('AREncode')[0].arencode; return !a.windows.sw.isOpen && a.windows.ed.isOpen; }));

  // icon bar menu: Info, Save choices
  const ib = await page.evaluate(() => { const it = wimp.iconbar.items.find((i) => i.task?.name === 'AREncode'); return { x: wimp.iconbar.iconScreenX(it), y: wimp.height - 30 }; });
  await page.mouse.click(ib.x, ib.y, { button: 'right' });
  await page.waitForTimeout(300);
  check('icon bar menu', (await menuTexts(page, 0)).join('|') === 'Info|Save choices|Quit', (await menuTexts(page, 0)).join('|'));
  await hoverArrow(page, 0, 0);
  await page.waitForTimeout(300);
  await shot(page, 'info');
  await page.mouse.move(ib.x, ib.y - 60);
  await page.keyboard.press('Escape');
  await page.mouse.click(ib.x, ib.y, { button: 'right' });
  await page.waitForTimeout(300);
  await clickItem(page, 0, 1);
  await page.waitForTimeout(300);
  const ch = await page.evaluate(async () => { const p = '<AREncode$Dir>.!Choices'; return os.vfs.exists(p) ? await os.vfs.readText(p) : ''; });
  check('Save choices writes AREncode$OptionsFile', /^AREncode choices file/.test(ch) && /cmode:bandwidth/.test(ch) && /filters:SharpenY/.test(ch), ch.slice(0, 80));

  // Quit
  await page.mouse.click(ib.x, ib.y, { button: 'right' });
  await page.waitForTimeout(300);
  await clickItem(page, 0, 2);
  await page.waitForTimeout(300);
  check('Quit', await page.evaluate(() => os.apps.tasksOf('AREncode').length === 0));
};
