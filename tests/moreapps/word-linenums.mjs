// !Letters' line numbers (Batch D P11.1, D24) in the real desktop: a
// document whose section has w:lnNumType (count by 1) opens in Print
// layout with 1, 2, 3, 4 drawn right aligned in the left margin, each
// on its paragraph's baseline, 0.25 inch left of the text; Draft
// draws none. Format > Paragraph... has "Suppress line numbers" (off
// here); ticking it (a real click) and OK sets suppressLineNumbers
// on the paragraph in one undo step, and the numbers drawn go 1, 2,
// 3 past it; Ctrl-Z puts the four back. No page errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const MAR = 'w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"';
const SECT = `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar ${MAR}/><w:lnNumType w:countBy="1"/></w:sectPr>`;
const BODY = p(r('Alpha line')) + p(r('Bravo line')) + p(r('Charlie line')) + p(r('Delta line')) + SECT;
const files = { Lnum: Array.from(await buildDocx({ 'word/document.xml': documentXml(BODY) })) };

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);

const { browser, page, logs } = await launch({ height: 900 });
const ev = (fn, arg) => page.evaluate(fn, arg);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async (files) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = () => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === 'Lnum');
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__menu = (top, text) => {
      const d = window.__doc(), m = d.win.menu({}).items.find((i) => i.text === top).submenu();
      const it = m.items.find((i) => i.text === text);
      it.action(it);
    };
    window.__box = () => {
      const d = window.__doc();
      return d.dw.boxes.has('para') ? window.__word().word.dialog({ key: 'para:' + d.docKey, rows: [] }) : null;
    };
    window.__icon = (name) => {
      const w = window.__box().win, b = w.iconByName(name).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    /** Digits drawn on the canvas in one redraw, with work-area x and y (fillText spied on, put back), the text's left edge. */
    window.__drawn = async () => {
      const d = window.__doc(), cv = d.win._canvas, k = cv.width / d.win.w;
      const proto = CanvasRenderingContext2D.prototype, real = proto.fillText, seen = [];
      proto.fillText = function (t, x, y, ...a) {
        if (this.canvas === cv) {
          const m = this.getTransform();
          seen.push({ t: String(t), x: (m.a * x + m.c * y + m.e) / k + d.win.scrollX, y: (m.b * x + m.d * y + m.f) / k + d.win.scrollY,
            align: this.textAlign });
        }
        return real.call(this, t, x, y, ...a);
      };
      try {
        d.win.scrollTo(0, 0);
        d.win.invalidate();
        await window.__frames(2);
      } finally {
        proto.fillText = real;
      }
      const L = d.dw.L, Pl = L.place, left = Pl && Pl.pages ? Pl.sheet.rect(Pl.pages.at(0)).x + Pl.pages.at(0).frames[0].x : L.left;
      const texts = seen.filter((s) => /line$/.test(s.t)).map((s) => ({ t: s.t, x: s.x, y: s.y }));
      return { nums: seen.filter((s) => /^\d+$/.test(s.t) && s.x <= left + 0.5), texts, left };
    };
    window.__st = () => {
      const d = window.__doc(), b = d.dw.doc.sections[0].blocks;
      return { view: d.viewName, depth: d.d.undoDepth, sup: b.map((x) => (x.pPr || {}).suppressLineNumbers ?? null) };
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await new Promise((res) => setTimeout(res, 50));
    await window.__word().word.recentReady;
    await window.__word().word.open('RAM::RamDisc0.$.Lnum');
    await window.__frames(3);
    window.__doc().win.open({ x: 60, y: 40, w: 900, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
  }, files);
  await page.waitForFunction(() => window.__doc()?.dw.L.place?.pages?.at(0));

  const d0 = await ev(async () => ({ ...window.__st(), ...(await window.__drawn()) }));
  const nums0 = d0.nums.map((n) => n.t);
  ok('opens in Print layout; 1, 2, 3, 4 drawn in the left margin, right aligned 24 px (0.25 in) left of the text',
    d0.view === 'print' && nums0.join() === '1,2,3,4' && d0.nums.every((n) => Math.abs(n.x - (d0.left - 24)) < 0.6), d0);
  ok('... each on its paragraph\'s baseline', d0.texts.length === 4 && d0.nums.every((n, i) => Math.abs(n.y - d0.texts[i].y) < 0.6), d0);

  const dr = await ev(async () => {
    window.__menu('View', 'Draft');
    await window.__frames(3);
    const x = await window.__drawn();
    window.__menu('View', 'Print layout');
    await window.__frames(3);
    return { view: window.__doc().viewName, n: x.nums.length, texts: x.texts.length };
  });
  ok('Draft draws no line numbers', dr.n === 0 && dr.texts === 4, dr);

  // ------------------------------------------------ Suppress line numbers in the Paragraph box
  await ev(() => {
    const d = window.__doc(), b = d.dw.doc.sections[0].blocks[1];
    d.dw.view.setSelection({ anchor: { id: b.id, off: 2 }, head: { id: b.id, off: 2 } });
    window.__menu('Format', 'Paragraph...');
  });
  await page.waitForFunction(() => window.__box()?.isOpen);
  const b0 = await ev(() => ({ v: window.__box().values().nolines, text: window.__box().win.iconByName('nolines').text }));
  ok('Format > Paragraph... has "Suppress line numbers", off for this paragraph', b0.v === false, b0);
  const s0 = await ev(() => window.__st());
  const at = await ev(() => window.__icon('nolines'));
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => window.__box()?.values().nolines === true);
  const okAt = await ev(() => window.__icon('button:OK'));
  await page.mouse.click(okAt.x, okAt.y);
  await page.waitForFunction(() => !window.__box() && window.__doc().dw.doc.sections[0].blocks[1].pPr?.suppressLineNumbers === true);
  const d1 = await ev(async () => { await window.__frames(2); return { ...window.__st(), ...(await window.__drawn()) }; });
  ok('ticked and OK: suppressLineNumbers on that paragraph only, one undo step', d1.depth === s0.depth + 1
    && JSON.stringify(d1.sup) === JSON.stringify([null, true, null, null]), { s0, d1 });
  ok('... the numbers drawn go 1, 2, 3 past it (Alpha, Charlie, Delta)', d1.nums.map((n) => n.t).join() === '1,2,3'
    && [0, 2, 3].every((k, i) => Math.abs(d1.nums[i].y - d1.texts[k].y) < 0.6), d1);
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => window.__doc().d.undoDepth === 0 || !window.__doc().dw.doc.sections[0].blocks[1].pPr?.suppressLineNumbers);
  const d2 = await ev(async () => { await window.__frames(2); return { ...window.__st(), ...(await window.__drawn()) }; });
  ok('Ctrl-Z: the paragraph numbered again: 1, 2, 3, 4', d2.depth === s0.depth && d2.nums.map((n) => n.t).join() === '1,2,3,4', d2);
  const msgs = await ev(() => window.__msgs);
  ok('no errors reported', !msgs.length, msgs);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
