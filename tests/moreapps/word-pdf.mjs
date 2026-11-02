// !Letters' the window menu's Export as PDF... in the real desktop (Batch G1):
// the item opens the box (Pages All, the markup named); From after
// To is refused with a message and writes nothing; From 2 To 99 and
// OK open the save box with a /pdf name, whose OK writes a file of
// type &ADF that is a PDF of pages 2 to the last, the window's '*',
// undo and title unchanged; Cancel while the pages are made writes
// nothing and says nothing; the box is deleted with its document.
// Needs the disc built by tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const BR = '<w:r><w:br w:type="page"/></w:r>';
const pages = (n) => Array.from({ length: n }, (_, i) => p(r(`Page ${i + 1} of the export test.`) + (i + 1 < n ? BR : ''))).join('');
const three = await buildDocx({ 'word/document.xml': documentXml(pages(3)) });
const long = await buildDocx({ 'word/document.xml': documentXml(pages(120)) });

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async ([a, b]) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    os.vfs.writeFile('RAM::RamDisc0.$.Three', new Uint8Array(a), { filetype: 0xA7E });
    os.vfs.writeFile('RAM::RamDisc0.$.Long', new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__by = (leaf) => window.__word().word.docs.find((d) => d.leaf === leaf);
    window.__click = (w, name) => w.emit('click', { icon: w.iconByName(name), button: 'select' });
    window.__type = (w, name, text) => { const ic = w.iconByName(name); ic.setText(text); w.emit('iconchanged', { icon: ic }); };
    window.__pdf = (d) => { d.win.menu({}).items.find((i) => i.text === 'Export as PDF...').action(); return d.dw.boxes.get('pdf'); };
    window.__head = async (path) => String.fromCharCode(...(await os.vfs.readFile(path)).subarray(0, 5));
    window.__count = async (path) => {
      const s = new TextDecoder('latin1').decode(await os.vfs.readFile(path));
      const m = /\/Type \/Pages[^]*?\/Count (\d+)/.exec(s);
      return m ? Number(m[1]) : -1;
    };
  }, [Array.from(three), Array.from(long)]);
  await ev(async () => {
    await os.filer.run('RAM::RamDisc0.$.Three');
    for (let i = 0; i < 200 && !window.__by('Three'); i++) await window.__sleep(50);
    await window.__frames(4);
  });

  // ------------------------------------------------ the box
  const b1 = await ev(async () => {
    const d = window.__by('Three');
    const w = window.__pdf(d);
    await window.__frames(2);
    return { open: w.isOpen, title: w.title, markup: w.iconByName('markup')?.text,
      from: w.iconByName('from').shaded, all: w.iconByName('all').selected };
  });
  ok('Export as PDF... opens the box: All chosen, From shaded, the markup named', b1.open && b1.title === 'Export as PDF'
    && b1.markup === 'Markup: final text' && b1.from && b1.all, b1);

  const b2 = await ev(async () => {
    const d = window.__by('Three'), w = d.dw.boxes.get('pdf');
    window.__type(w, 'from', '3');
    window.__type(w, 'to', '2');
    window.__click(w, 'button:OK');
    await window.__frames(2);
    const s = d.dw.boxes.get('pdfsave');
    return { msg: w.iconByName('msg').text, open: w.isOpen, save: !!(s && s.isOpen),
      files: os.vfs.list('RAM::RamDisc0.$').map((e) => e.name) };
  });
  ok('From after To: refused with a message, no save box, nothing written', /From/.test(b2.msg) && b2.open && !b2.save
    && !b2.files.some((n) => /pdf/i.test(n)), b2);

  // ------------------------------------------------ From 2 To 99: the file
  const b3 = await ev(async () => {
    const d = window.__by('Three'), w = d.dw.boxes.get('pdf');
    const before = { title: d.win.title, dirty: d.view.dirty, undo: d.view.undoDepth };
    window.__msgs.length = 0;
    window.__type(w, 'from', '2');
    window.__type(w, 'to', '99');
    window.__click(w, 'button:OK');
    await window.__frames(2);
    const s = d.dw.boxes.get('pdfsave');
    const res = { name: s.filename(), type: s.filetype };
    s.icons[1].setText('RAM::RamDisc0.$.Out/pdf');
    s.emit('click', { icon: s.icons[0], button: 'select' });
    for (let i = 0; i < 400 && !os.vfs.exists('RAM::RamDisc0.$.Out/pdf'); i++) await window.__sleep(25);
    await window.__sleep(100);
    res.filetype = os.vfs.stat('RAM::RamDisc0.$.Out/pdf')?.filetype;
    res.head = await window.__head('RAM::RamDisc0.$.Out/pdf');
    res.count = await window.__count('RAM::RamDisc0.$.Out/pdf');
    res.gone = !d.dw.boxes.get('pdf');
    res.saveOpen = s.isOpen;
    res.before = before;
    res.after = { title: d.win.title, dirty: d.view.dirty, undo: d.view.undoDepth };
    res.msgs = [...window.__msgs];
    return res;
  });
  ok('the save box: a /pdf name, file type &ADF', b3.name === 'RAM::RamDisc0.$.Three/pdf' && b3.type === 0xADF, b3);
  ok('OK writes a PDF of pages 2 to 3, file type &ADF; the boxes close', b3.filetype === 0xADF && b3.head === '%PDF-'
    && b3.count === 2 && b3.gone && !b3.saveOpen, b3);
  ok('the window is unchanged and nothing is said', JSON.stringify(b3.before) === JSON.stringify(b3.after)
    && !b3.msgs.length, b3);

  // ------------------------------------------------ Cancel while the pages are made
  const b4 = await ev(async () => {
    await os.filer.run('RAM::RamDisc0.$.Long');
    for (let i = 0; i < 200 && !window.__by('Long'); i++) await window.__sleep(50);
    await window.__frames(4);
    const d = window.__by('Long'), w = window.__pdf(d);
    window.__msgs.length = 0;
    window.__click(w, 'button:OK');
    await window.__frames(2);
    const s = d.dw.boxes.get('pdfsave');
    s.icons[1].setText('RAM::RamDisc0.$.Stopped/pdf');
    s.emit('click', { icon: s.icons[0], button: 'select' });
    // Cancel the moment a "Page n of N" is shown (a small document
    // makes its pages between two polls): watch the message text
    const seen = [];
    const icon = w.iconByName('msg');
    let stopped = false;
    const was = icon.setText.bind(icon);
    icon.setText = (t, ...rest) => {
      was(t, ...rest);
      if (t) seen.push(t);
      if (!stopped && /^Page \d+ of/.test(t)) {
        stopped = true;
        window.__click(w, 'button:Cancel');
      }
    };
    for (let i = 0; i < 400 && !stopped; i++) await window.__sleep(5);
    await window.__sleep(800);
    return { seen: [...new Set(seen)], written: os.vfs.exists('RAM::RamDisc0.$.Stopped/pdf'),
      gone: !d.dw.boxes.get('pdf'), saveOpen: s.isOpen, msgs: [...window.__msgs] };
  });
  ok('Cancel during "Page n of N": nothing written, nothing said, the boxes closed',
    b4.seen.some((t) => /^Page \d+ of \d+$/.test(t)) && !b4.written && !b4.msgs.length && b4.gone && !b4.saveOpen, b4);

  // ------------------------------------------------ the box goes with its document
  const b5 = await ev(async () => {
    const d = window.__by('Three'), w = window.__pdf(d);
    d.dw.close();
    await window.__frames(2);
    return { open: w.isOpen, deleted: ![...os.wimp.windows].includes(w) };
  });
  ok('the box is deleted with its document', !b5.open && b5.deleted, b5);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
