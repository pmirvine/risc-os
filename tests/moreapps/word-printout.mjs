// !Letters' File > Print... (window menu item and Ctrl+P) in the real desktop, through !Printers:
// without !Printers: the error box and no Print box; with it: the box (All, Fit on, the printer
// line, the markup), From after To refused, Print opens the output page with one JPEG image per
// page (each .lsheet the paper's size, @page margin 0, the pixels not blank), a range, Fit off
// against on for a Letter page on A4, landscape, a RISC OS face drawn, Cancel while the pages are
// made leaves no output window, and a second Print works; the box goes with its document and the
// document, undo and '*' are unchanged.
// Needs the disc built by tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const BR = '<w:r><w:br w:type="page"/></w:r>';
const pages = (n, rpr = '') => Array.from({ length: n }, (_, i) => p(r(`Page ${i + 1} of the print test.`, rpr) + (i + 1 < n ? BR : ''))).join('');
const LETTER = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>';
const docx = (body) => buildDocx({ 'word/document.xml': documentXml(body) });
const three = await docx(pages(3));
const long = await docx(pages(120));
const letter = await docx(pages(2) + LETTER);
const fontT = await docx(p(r('Wide wide WWWW mmmm Trinity text here', '<w:rFonts w:ascii="Trinity" w:hAnsi="Trinity"/><w:sz w:val="48"/>')));
const fontZ = await docx(p(r('Wide wide WWWW mmmm Trinity text here', '<w:rFonts w:ascii="Zzzqq" w:hAnsi="Zzzqq"/><w:sz w:val="48"/>')));
const lastPage = (css) => css.split(' ## ')[0].split(' | ').filter((x) => /^@page/.test(x)).pop();
const PRINTER_LINE = /^Printer: .+, A4 (portrait|landscape)$/;

async function session(setup) {
  const { browser, page, logs } = await launch();
  const popups = [];
  page.context().on('page', (pg) => popups.push(pg));
  if (setup) await page.addInitScript(setup);
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await page.evaluate(async (files) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    for (const [n, a] of Object.entries(files)) os.vfs.writeFile('RAM::RamDisc0.$.' + n, new Uint8Array(a), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__by = (leaf) => window.__word().word.docs.find((d) => d.leaf === leaf);
    window.__click = (w, name) => w.emit('click', { icon: w.iconByName(name), button: 'select' });
    window.__type = (w, name, text) => { const ic = w.iconByName(name); ic.setText(text); w.emit('iconchanged', { icon: ic }); };
    window.__menu = (d) => d.win.menu({}).items.find((i) => i.text === 'Print...').action();
    // !Printers' jobs still running (print() not yet answered): counted once __track() wraps os.printers.print
    window.__jobs = 0;
    window.__track = () => {
      const api = os.printers, real = api.print.bind(api);
      api.print = (doc) => {
        window.__jobs++;
        const job = real(doc);
        Promise.resolve(job).finally(() => { window.__jobs--; });
        return job;
      };
    };
    window.__idle = async () => { for (let i = 0; i < 800 && window.__jobs; i++) await window.__sleep(25); return window.__jobs; };
    window.__open = async (leaf) => {
      await os.filer.run('RAM::RamDisc0.$.' + leaf);
      for (let i = 0; i < 200 && !window.__by(leaf); i++) await window.__sleep(50);
      await window.__frames(4);
    };
  }, files_);
  return { browser, page, logs, popups };
}
const files_ = {
  Three: Array.from(three), Long: Array.from(long), Letter: Array.from(letter),
  FontT: Array.from(fontT), FontZ: Array.from(fontZ),
};

/** The output page's sheets: sizes, images, pixel facts. */
async function sheetsOf(pg) {
  await pg.waitForFunction(() => document.querySelectorAll('.lsheet img').length > 0, null, { timeout: 30000 });
  await pg.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 30000 });
  return pg.evaluate(async () => {
    const mm = (v) => parseFloat(v);
    const sheets = [...document.querySelectorAll('.lsheet')].map((s) => {
      const cs = getComputedStyle(s), im = s.querySelector('img');
      const px = (v) => mm(v) * 25.4 / 96;
      const rc = s.getBoundingClientRect();
      return { w: +(px(cs.width)).toFixed(1), h: +(px(cs.height)).toFixed(1), rcw: rc.width * 25.4 / 96, rch: rc.height * 25.4 / 96,
        img: im && { left: mm(im.style.left), top: mm(im.style.top), w: mm(im.style.width), h: mm(im.style.height),
          src: im.src.slice(0, 22), nat: im.naturalWidth, natH: im.naturalHeight } };
    });
    const pixels = [];
    for (const im of document.images) {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let dark = 0, nonwhite = 0, minx = c.width, maxx = -1;
      for (let i = 0, k = 0; i < d.length; i += 4, k++) {
        const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (lum < 250) nonwhite++;
        if (lum < 100) { dark++; const xx = k % c.width; if (xx < minx) minx = xx; if (xx > maxx) maxx = xx; }
      }
      pixels.push({ dark, nonwhite, minx, maxx, w: c.width });
    }
    let css = '';
    for (const st of document.querySelectorAll('style')) css += st.textContent;
    const rules = [];
    for (const sh of document.styleSheets) { try { for (const ru of sh.cssRules) if (ru.type === 6) rules.push(ru.cssText); } catch { /* */ } }
    css = rules.join(' | ') + ' ## ' + css;
    return { sheets, pixels, css, n: document.images.length };
  });
}

let browser;
try {
  // ------------------------------------------------ without !Printers
  const s1 = await session();
  browser = s1.browser;
  const { page, popups } = s1;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const errs1 = s1.logs;
  await ev(() => window.__open('Three'));
  const n1 = await ev(async () => {
    const d = window.__by('Three');
    window.__msgs.length = 0;
    window.__menu(d);
    await window.__frames(2);
    return { msgs: [...window.__msgs], box: !!d.dw.boxes.get('print'), printers: !!os.printers };
  });
  ok('no !Printers: the menu Print... says there is no printer driver and opens no Print box',
    !n1.printers && n1.msgs.length === 1 && /no printer driver/.test(n1.msgs[0]) && !n1.box, n1);
  await ev(() => { window.__msgs.length = 0; });
  await page.keyboard.press('Control+p');
  await ev(() => window.__frames(3));
  const n2 = await ev(() => ({ msgs: [...window.__msgs], box: !!window.__by('Three').dw.boxes.get('print') }));
  ok('no !Printers: Ctrl+P says the same once and opens no Print box', n2.msgs.length === 1 && /no printer driver/.test(n2.msgs[0]) && !n2.box, n2);
  ok('no !Printers: no output window opened', popups.length === 0, popups.length);

  // ------------------------------------------------ with !Printers
  await ev(async () => {
    os.apps.start('Printers');
    for (let i = 0; i < 200 && !os.printers?.current; i++) await window.__sleep(50);
    window.__track();
  });
  const cur = await ev(() => os.printers.current);
  ok('!Printers running with a current A4 printer', cur && /A4/.test(cur.paper.name) && !cur.landscape, cur);

  await ev(() => { window.__msgs.length = 0; });
  await page.keyboard.press('Control+p');
  await ev(() => window.__frames(3));
  const b1 = await ev(() => {
    const w = window.__by('Three').dw.boxes.get('print');
    return w && { open: w.isOpen, title: w.title, all: w.iconByName('all').selected, fit: w.iconByName('fit').selected,
      printer: w.iconByName('printer').text, markup: w.iconByName('markup').text, from: w.iconByName('from').shaded,
      msgs: [...window.__msgs] };
  });
  ok('Ctrl+P opens the Print box: All, Fit to paper on, the printer line, the markup line, no error',
    b1 && b1.open && b1.title === 'Print' && b1.all && b1.fit === true && PRINTER_LINE.test(b1.printer)
    && b1.markup === 'Markup: final text' && b1.from && !b1.msgs.length, b1);
  await ev(() => { const d = window.__by('Three'); d.dw.boxes.get('print').close?.(); });
  await ev(() => window.__frames(2));

  const b2 = await ev(async () => {
    const d = window.__by('Three');
    window.__menu(d);
    await window.__frames(2);
    const w = d.dw.boxes.get('print');
    window.__type(w, 'from', '3');
    window.__type(w, 'to', '2');
    window.__click(w, 'button:Print');
    await window.__frames(2);
    return { msg: w.iconByName('msg').text, open: w.isOpen, printers: os.printers.queue?.length ?? 0 };
  });
  await page.waitForTimeout(500);
  ok('From after To: refused with the reason, the box stays, nothing is printed', /From is after To/.test(b2.msg) && b2.open
    && popups.length === 0, { b2, popups: popups.length });

  // ------------------------------------------------ Print all 3 pages
  const before = await ev(() => { const d = window.__by('Three'); return { title: d.win.title, dirty: d.view.dirty, undo: d.view.undoDepth }; });
  const pop1 = s1.page.context().waitForEvent('page', { timeout: 20000 });
  await ev(() => {
    const d = window.__by('Three'), w = d.dw.boxes.get('print');
    window.__type(w, 'from', ''); window.__type(w, 'to', '');
    window.__click(w, 'all');
    window.__click(w, 'button:Print');
  });
  const o1 = await pop1;
  const res1 = await sheetsOf(o1);
  const sizesOk = (s, w, h) => s.every((x) => Math.abs(x.w - w) < 0.15 && Math.abs(x.h - h) < 0.15 && Math.abs(x.rcw - w) < 0.5);
  ok('Print of 3 pages: the output page has exactly 3 images, each in a .lsheet of 210.0 x 297.0 mm', res1.n === 3 && res1.sheets.length === 3
    && sizesOk(res1.sheets, 210, 297), res1);
  ok('the last @page rule: the paper\'s size (209.9 x 297.0 mm: A4 as !Printers measures it), margin 0', lastPage(res1.css) && /size: 209\.9mm 297mm/.test(lastPage(res1.css)) && /margin: 0(mm|px)?;?\s*\}/.test(lastPage(res1.css)), res1.css.slice(0, 400));
  ok('each image is a decoded JPEG data URL', res1.sheets.every((x) => x.img.src.startsWith('data:image/jpeg') && x.img.nat > 0 && x.img.natH > 0), res1.sheets);
  ok('no page image is blank; text is dark in each', res1.pixels.every((x) => x.nonwhite > 200 && x.dark > 100), res1.pixels);
  const after1 = await ev(async () => {
    await window.__sleep(300);
    const d = window.__by('Three');
    return { title: d.win.title, dirty: d.view.dirty, undo: d.view.undoDepth, box: !!d.dw.boxes.get('print'), msgs: [...window.__msgs] };
  });
  ok('the box is deleted when the pages are made; the document, undo and * unchanged; nothing said',
    !after1.box && after1.title === before.title && after1.dirty === before.dirty && after1.undo === before.undo
    && !after1.msgs.length, { before, after1 });
  await o1.close().catch(() => {});
  await ev(() => window.__idle());

  // ------------------------------------------------ a range
  const pop2 = page.context().waitForEvent('page', { timeout: 20000 });
  await ev(async () => {
    const d = window.__by('Three');
    window.__menu(d);
    await window.__frames(2);
    const w = d.dw.boxes.get('print');
    window.__type(w, 'from', '2'); window.__type(w, 'to', '3');
    window.__click(w, 'button:Print');
  });
  const o2 = await pop2;
  const res2 = await sheetsOf(o2);
  ok('From 2 To 3: 2 images, pages 2 and 3 (not blank)', res2.n === 2 && res2.pixels.every((x) => x.dark > 100), res2);
  await o2.close().catch(() => {});
  await ev(() => window.__idle());

  // ------------------------------------------------ Fit on / off, Letter page on A4
  await ev(() => window.__open('Letter'));
  const printLetter = async (fit) => {
    const pop = page.context().waitForEvent('page', { timeout: 20000 });
    await ev(async (fit) => {
      const d = window.__by('Letter');
      window.__menu(d);
      await window.__frames(2);
      const w = d.dw.boxes.get('print');
      { const ic = w.iconByName('fit'); ic.setState({ selected: fit }); w.emit('iconchanged', { icon: ic }); }
      window.__fitNow = w.iconByName('fit').selected;
      window.__click(w, 'button:Print');
    }, fit);
    const o = await pop;
    const res = await sheetsOf(o);
    await o.close().catch(() => {});
    await ev(() => window.__idle());
    return res;
  };
  const fitOn = await printLetter(true);
  const fitOff = await printLetter(false);
  const iOn = fitOn.sheets[0].img, iOff = fitOff.sheets[0].img;
  ok('Fit on: a Letter page on A4 sits inside the 210 x 297 sheet', fitOn.n === 2 && iOn.left >= -0.05 && iOn.top >= -0.05
    && iOn.left + iOn.w <= 210.05 && iOn.top + iOn.h <= 297.05 && (Math.abs(iOn.w - 210) < 0.1 || Math.abs(iOn.h - 297) < 0.1), fitOn.sheets);
  ok('Fit off: the Letter page at 100% (215.9 x 279.4 mm), centred', Math.abs(iOff.w - 215.9) < 0.2 && Math.abs(iOff.h - 279.4) < 0.2
    && Math.abs(iOff.left - (210 - 215.9) / 2) < 0.2, fitOff.sheets);
  ok('Fit on and off give different image boxes', Math.abs(iOn.w - iOff.w) > 1, { iOn, iOff, fitNow: await ev(() => window.__fitNow) });

  // ------------------------------------------------ a RISC OS face
  const textWidth = async (leaf) => {
    await ev((l) => window.__open(l), leaf);
    const pop = page.context().waitForEvent('page', { timeout: 20000 });
    await ev(async (l) => {
      const d = window.__by(l);
      window.__menu(d);
      await window.__frames(2);
      window.__click(d.dw.boxes.get('print'), 'button:Print');
    }, leaf);
    const o = await pop;
    const res = await sheetsOf(o);
    await o.close().catch(() => {});
    await ev(() => window.__idle());
    return res.pixels[0];
  };
  const pt = await textWidth('FontT'), pz = await textWidth('FontZ');
  ok('a Trinity run is drawn in the printed image: its text extent differs from an unknown-font fallback',
    pt.dark > 100 && pz.dark > 100 && (pt.maxx - pt.minx) !== (pz.maxx - pz.minx), { pt, pz });

  // ------------------------------------------------ Cancel while the pages are made
  await ev(() => window.__open('Long'));
  const popsBefore = popups.length;
  const popC = page.context().waitForEvent('page', { timeout: 20000 });
  const c1 = await ev(async () => {
    const d = window.__by('Long');
    window.__msgs.length = 0;
    window.__menu(d);
    await window.__frames(2);
    const w = d.dw.boxes.get('print');
    let stopped = false;
    const icon = w.iconByName('msg'), was = icon.setText.bind(icon), seen = [];
    icon.setText = (t, ...rest) => {
      was(t, ...rest);
      if (t) seen.push(t);
      if (!stopped && /^Page \d+ of/.test(t)) { stopped = true; window.__click(w, 'button:Cancel'); }
    };
    window.__click(w, 'button:Print');
    for (let i = 0; i < 600 && !stopped; i++) await window.__sleep(5);
    const busy = await window.__idle();
    await window.__frames(2);
    return { seen: [...new Set(seen)].slice(0, 5), stopped, open: w.isOpen, msgs: [...window.__msgs],
      dirty: d.view.dirty, busy };
  });
  const oc = await popC.catch(() => null);
  if (oc && !oc.isClosed()) await oc.waitForEvent('close', { timeout: 10000 }).catch(() => {});
  const outs = popups.slice(popsBefore);
  ok('Cancel at "Page n of N": an output window opened at the click and is closed, nothing printed, nothing said, the box closed',
    c1.stopped && !!oc && outs.length === 1 && outs.every((o) => o.isClosed()) && !c1.busy && !c1.msgs.length && !c1.open,
    { c1, opened: !!oc, outs: outs.length, closed: outs.map((o) => o.isClosed()) });
  // an immediate second Print works
  const pop3 = page.context().waitForEvent('page', { timeout: 30000 });
  await ev(async () => {
    const d = window.__by('Three');
    window.__menu(d);
    await window.__frames(2);
    window.__click(d.dw.boxes.get('print'), 'button:Print');
  });
  const o3 = await pop3;
  const res3 = await sheetsOf(o3);
  ok('an immediate second Print works: 3 images', res3.n === 3 && res3.pixels.every((x) => x.dark > 100), res3.n);
  await o3.close().catch(() => {});

  // ------------------------------------------------ the desktop's page hidden (behind the output window)
  const popH = page.context().waitForEvent('page', { timeout: 60000 });
  const h0 = await ev(async () => {
    const d = window.__by('Long');
    window.__menu(d);
    await window.__frames(2);
    // hidden as behind the output window or in another tab: no frames from now on
    window.__raf = window.requestAnimationFrame;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    window.requestAnimationFrame = () => 0;
    window.__t0 = performance.now();
    window.__click(d.dw.boxes.get('print'), 'button:Print');
  });
  const oh = await popH;
  const resH = await sheetsOf(oh);
  const hidden = await ev(() => {
    const ms = performance.now() - window.__t0;
    delete document.hidden;
    window.requestAnimationFrame = window.__raf;
    return { ms: Math.round(ms), box: !!window.__by('Long').dw.boxes.get('print') };
  });
  out.push(`# hidden page: 120 pages in ${hidden.ms} ms`);
  ok('the desktop\'s page hidden, no frames: 120 pages printed, the box closed', resH.n === 120 && !hidden.box, { n: resH.n, hidden, h0 });
  await oh.close().catch(() => {});
  await ev(() => window.__idle());

  // ------------------------------------------------ the box goes with its document
  const e1 = await ev(async () => {
    const d = window.__by('Long');
    window.__menu(d);
    await window.__frames(2);
    const w = d.dw.boxes.get('print');
    d.dw.close();
    await window.__frames(2);
    return { open: w.isOpen, deleted: ![...os.wimp.windows].includes(w) };
  });
  ok('the box is deleted with its document', !e1.open && e1.deleted, e1);
  const pageErrs = errs1.filter((l) => /PAGEERROR|^error:/.test(l));
  if (pageErrs.length) out.push('FAIL page errors\n' + pageErrs.join('\n'));

  // ------------------------------------------------ landscape
  await browser.close();
  const land = '(() => { try { localStorage.setItem("riscos371.printers", JSON.stringify({ printers: [{ id: 1, name: "Land", type: "PostScript Level 1", cls: "ps", short: "PoScript", def: null, active: true, opts: { orientation: "Landscape" } }], current: 1, papers: [] })); } catch {} })()';
  const s2 = await session(land);
  browser = s2.browser;
  const ev2 = (fn, arg) => s2.page.evaluate(fn, arg);
  await ev2(async () => {
    os.apps.start('Printers');
    for (let i = 0; i < 200 && !os.printers?.current; i++) await window.__sleep(50);
    await window.__open('Three');
  });
  const lc = await ev2(() => os.printers.current);
  const pop4 = s2.page.context().waitForEvent('page', { timeout: 20000 });
  const lb = await ev2(async () => {
    const d = window.__by('Three');
    window.__menu(d);
    await window.__frames(2);
    const w = d.dw.boxes.get('print');
    const line = w.iconByName('printer').text;
    window.__click(w, 'button:Print');
    return line;
  });
  const o4 = await pop4;
  const res4 = await sheetsOf(o4);
  ok('landscape printer: the line says landscape; 3 sheets of 297.0 x 210.0 mm; @page 297mm 210mm',
    lc?.landscape && /landscape$/.test(lb) && res4.n === 3 && sizesOk(res4.sheets, 297, 210)
    && /size: 297mm 209\.9mm/.test(lastPage(res4.css)), { lc, lb, res4 });
  const pageErrs2 = s2.logs.filter((l) => /PAGEERROR|^error:/.test(l));
  if (pageErrs2.length) out.push('FAIL page errors\n' + pageErrs2.join('\n'));
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
await browser?.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) ? 1 : 0;
