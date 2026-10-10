// !Word's life: without its font files it still opens and draws
// documents (in fallback fonts, with no error); three documents
// opened and closed, then Quit, leave no windows, tasks or page
// elements behind; 30 windows opened and closed leave no panes (the
// toolbar rows, the ruler). First, with its fonts: !Word started three
// times adds each font face to the page once.
// Needs the disc built by tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const mk = (t) => buildDocx({ 'word/document.xml': documentXml(p(r(t, '<w:b/>')) + p(r(t + ' again, in a longer line of text'))) });
const docs = [await mk('First'), await mk('Second'), await mk('Third')];

const { browser, page, logs } = await launch();
const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail)}`);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  // with its fonts: each run of !Word reuses the faces the page has
  const r2 = await page.evaluate(async (bytes) => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const v = os.vfs;
    v.writeFile('RAM::RamDisc0.$.First', new Uint8Array(bytes), { filetype: 0xA7E });
    const faces = [];
    for (let run = 0; run < 3; run++) {
      await os.filer.run('RAM::RamDisc0.$.First');
      let t = null;
      for (let i = 0; i < 200 && !(t = os.wimp.tasks.find((x) => x.alive && x.name === 'Word'))?.word?.docs.length; i++) await sleep(50);
      await document.fonts.ready;
      await sleep(200);
      faces.push([...document.fonts].filter((f) => /Carlito|Liberation/.test(f.family)).length);
      t.quit();
      await sleep(200);
    }
    return { faces };
  }, Array.from(docs[0]));
  ok('a run of !Word after Quit adds no font faces again', r2.faces[0] > 0 && r2.faces.every((n) => n === r2.faces[0]), r2.faces);
  // 30 windows opened and closed: no panes (toolbar rows, ruler) left
  const r3 = await page.evaluate(async (bytes) => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const frames = async (n) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    const v = os.vfs;
    v.writeFile('RAM::RamDisc0.$.First', new Uint8Array(bytes), { filetype: 0xA7E });
    v.writeFile('RAM::RamDisc0.$.Cyc', new Uint8Array(bytes), { filetype: 0xA7E });
    await os.filer.run('RAM::RamDisc0.$.First');
    let t = null;
    for (let i = 0; i < 200 && !(t = os.wimp.tasks.find((x) => x.alive && x.name === 'Word'))?.word?.docs.length; i++) await sleep(50);
    await frames(3);
    const panes = () => [...os.wimp.windows].filter((w) => w._paneParent).length;
    const count = () => [t.windows.size, os.wimp.windows.size, panes(), document.querySelectorAll('*').length];
    const before = count();
    const per = [];
    for (let i = 0; i < 30; i++) {
      const dw = await t.word.open('RAM::RamDisc0.$.Cyc');
      await frames(1);
      per.push([dw.bar.tb.pane, dw.bar2.tb.pane, dw.rb.ruler.pane].filter((p) => p && p._paneParent === dw.win).length);
      if (i % 3 === 1) dw.setRuler(false);
      dw.close();
    }
    await frames(3);
    const after = count();
    t.quit();
    await sleep(200);
    return { before, after, per };
  }, Array.from(docs[0]));
  ok('30 windows opened and closed: each had its three panes, none is left behind', r3.per.every((n) => n === 3)
    && r3.after[0] === r3.before[0] && r3.after[1] === r3.before[1] && r3.after[2] === r3.before[2]
    && Math.abs(r3.after[3] - r3.before[3]) <= 5, r3);
  const r1 = await page.evaluate(async (bytes) => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const frames = async (n) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    const msgs = [];
    globalThis.__riscos.reportError = (m) => { msgs.push(String(m)); return Promise.resolve(1); };
    const v = os.vfs;
    // no font files
    const F = 'ADFS::HardDisc4.$.MoreApps.!Word.Fonts';
    for (const e of v.list(F)) if (e.name !== 'Licences') v.delete(`${F}.${e.name}`);
    const res = { left: v.list(F).map((e) => e.name) };
    const names = ['First', 'Second', 'Third'];
    names.forEach((n, i) => v.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(bytes[i]), { filetype: 0xA7E }));
    await frames(3);
    const count = () => ({
      tasks: os.wimp.tasks.filter((t) => t.alive).length,
      windows: os.wimp.windows.size,
      dom: document.querySelectorAll('*').length,
      icons: document.querySelectorAll('img, canvas').length,
    });
    res.base = count();
    await os.filer.run('RAM::RamDisc0.$.First');
    let t = null;
    for (let i = 0; i < 100 && !(t = os.wimp.tasks.find((x) => x.alive && x.name === 'Word'))?.word?.docs.length; i++) await sleep(50);
    await t.word.open('RAM::RamDisc0.$.Second');
    await t.word.open('RAM::RamDisc0.$.Third');
    await frames(3);
    res.open = t.word.docs.map((d) => d.win.title);
    // drawn, in fallback fonts
    const c = t.word.docs[0].win._canvas;
    const img = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let k = 0; k < img.length; k += 4) if (img[k] < 100) ink++;
    res.ink = ink;
    res.msgs = [...msgs];
    // menus with boxes, then close them all with the menu's Close
    for (const d of t.word.docs) {
      const m = d.win.menu({});
      for (const n of ['Save as', 'Save a copy', 'Info']) m.items.find((i) => i.text === n).submenu();
    }
    for (const d of t.word.docs) d.win.menu({}).items.find((i) => i.text === 'Close').action();
    await frames(2);
    res.closed = { docs: t.word.docs.length, windows: t.windows.size, alive: t.alive };
    // Quit from the icon bar menu
    const icon = [...t.iconbarIcons][0];
    const im = typeof icon.menu === 'function' ? icon.menu({}) : icon.menu;
    im.items.find((i) => i.text === 'Quit').action();
    await frames(3);
    await sleep(100);
    res.quit = { alive: t.alive, ...count() };
    return res;
  }, docs.map((d) => Array.from(d)));
  ok('the font files are gone', r1.left.join() === 'Licences', r1.left);
  ok('three documents open without their fonts', r1.open.join() === 'First,Second,Third', r1.open);
  ok('and are drawn, with no error', r1.ink > 300 && !r1.msgs.length, [r1.ink, r1.msgs]);
  ok('Close closes each document; Word stays on the icon bar', r1.closed.docs === 0 && r1.closed.windows === 1 /* the icon bar's Info box */ && r1.closed.alive, r1.closed);
  ok('Quit leaves nothing behind', !r1.quit.alive && r1.quit.tasks === r1.base.tasks && r1.quit.windows === r1.base.windows
    && Math.abs(r1.quit.dom - r1.base.dom) <= 5 && r1.quit.icons === r1.base.icons, [r1.base, r1.quit]);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
