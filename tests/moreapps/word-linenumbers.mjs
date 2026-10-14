// !Letters' Line numbers box (Batch D P11.2, D24) in the real desktop:
// Format > Layout... has its Line numbers... button live (no longer
// shaded); clicking it opens the Line numbers box for the caret
// section: Add line numbering off, Start at 1, Count by 1, Auto,
// Restart each page, the other controls shaded. Ticking Add line
// numbering (a real click) and OK: w:lnNumType countBy 1 on the
// section, the "Line Number" style added, one undo step, the box
// gone, and 1, 2, 3, 4 drawn in the left margin; the Layout box
// left open is not made stale (its OK beeps not). Count by 0 beeps,
// says why and keeps the box, nothing changed. Count by 2 and
// Continuous: 2 and 4 drawn, restart continuous written. Add line
// numbering off: w:lnNumType gone, no numbers drawn; Ctrl-Z gives
// count by 2 back. No page errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, stylesXml, p, r } from './build-docx.mjs';

const MAR = 'w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"';
const SECT = `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar ${MAR}/></w:sectPr>`;
const BODY = p(r('Alpha line')) + p(r('Bravo line')) + p(r('Charlie line')) + p(r('Delta line')) + SECT;
const STY = '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
  + '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/></w:style>';
const files = { Lnbox: Array.from(await buildDocx({ 'word/document.xml': documentXml(BODY), 'word/styles.xml': stylesXml(STY) })) };

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);

const { browser, page, logs } = await launch({ height: 1000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); await settle(); };
const click = async (q) => { await page.mouse.click(q.x, q.y); await settle(); };
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
    window.__doc = () => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === 'Lnbox');
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__menu = (top, text) => {
      const d = window.__doc(), m = d.win.menu({}).items.find((i) => i.text === top).submenu();
      const it = m.items.find((i) => i.text === text);
      it.action(it);
    };
    /** The open box of that name ('layout', 'linenums') or null. */
    window.__box = (n) => {
      const d = window.__doc();
      return d.dw.boxes.has(n) ? window.__word().word.dialog({ key: n + ':' + d.docKey, rows: [] }) : null;
    };
    window.__icon = (n, name) => {
      const w = window.__box(n).win, b = w.iconByName(name).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    /** Digits drawn left of the text in one redraw (fillText spied on, put back). */
    window.__drawn = async () => {
      const d = window.__doc(), cv = d.win._canvas, k = cv.width / d.win.w;
      const proto = CanvasRenderingContext2D.prototype, real = proto.fillText, seen = [];
      proto.fillText = function (t, x, y, ...a) {
        if (this.canvas === cv) {
          const m = this.getTransform();
          seen.push({ t: String(t), x: (m.a * x + m.c * y + m.e) / k + d.win.scrollX });
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
      const Pl = d.dw.L.place, left = Pl.sheet.rect(Pl.pages.at(0)).x + Pl.pages.at(0).frames[0].x;
      return seen.filter((s) => /^\d+$/.test(s.t) && s.x <= left + 0.5).map((s) => s.t).join();
    };
    window.__st = (n = 'linenums') => {
      const d = window.__doc(), b = window.__box(n);
      return { ln: d.dw.doc.sections[0].props.lnNumType ?? null, style: d.dw.doc.styles.styles.has('LineNumber'),
        depth: d.d.undoDepth, beeps: window.__beeps, box: !!b && b.isOpen, msg: b ? b.get('msg') : null,
        layout: !!window.__box('layout')?.isOpen };
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await new Promise((res) => setTimeout(res, 50));
    await window.__word().word.recentReady;
    await window.__word().word.open('RAM::RamDisc0.$.Lnbox');
    await window.__frames(3);
    window.__doc().win.open({ x: 60, y: 40, w: 900, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    const b = window.__doc().dw.doc.sections[0].blocks[0];
    window.__doc().dw.view.setSelection({ anchor: { id: b.id, off: 1 }, head: { id: b.id, off: 1 } });
  }, files);
  await page.waitForFunction(() => window.__doc()?.dw.L.place?.pages?.at(0));
  const field = async (name, text) => {
    await click(await ev((n) => window.__icon('linenums', n), name));
    await press('End');
    await press('Backspace', 8);
    if (text) { await page.keyboard.type(text); await settle(); }
  };
  const openBox = async () => {
    if (!(await ev(() => !!window.__box('layout')?.isOpen))) {
      await ev(() => window.__menu('Format', 'Layout...'));
      await page.waitForFunction(() => window.__box('layout')?.isOpen);
    }
    await click(await ev(() => window.__icon('layout', 'linenums')));
    await page.waitForFunction(() => window.__box('linenums')?.isOpen);
  };

  // ------------------------------------------------ the button and the box
  await ev(() => window.__menu('Format', 'Layout...'));
  await page.waitForFunction(() => window.__box('layout')?.isOpen);
  const sh = await ev(() => window.__box('layout').win.iconByName('linenums').shaded);
  ok('Format > Layout...: the Line numbers... button is not shaded', sh === false, sh);
  await openBox();
  const b0 = await ev(() => { const b = window.__box('linenums'), w = b.win;
    return { title: w.title, w: w.w, v: b.values(), shaded: ['start', 'countby', 'dist', 'auto', 'rpage'].map((n) => w.iconByName(n).shaded) }; });
  ok('Line numbers... opens the Line numbers box: off, Start at 1, Count by 1, Auto, Restart each page; the rest shaded',
    b0.title === 'Line numbers' && b0.w >= 540 && b0.v.on === false && b0.v.start === 1 && b0.v.countby === 1 && b0.v.auto === true
    && b0.v.restart === 'newPage' && b0.shaded.every(Boolean), b0);
  const s0 = await ev(() => window.__st());
  const n0 = await ev(() => window.__drawn());
  ok('no numbers drawn before', n0 === '', n0);

  // ------------------------------------------------ Add line numbering, OK
  await click(await ev(() => window.__icon('linenums', 'on')));
  const un = await ev(() => ['start', 'countby', 'auto', 'rpage'].map((n) => window.__box('linenums').win.iconByName(n).shaded));
  ok('ticking Add line numbering unshades Start at, Count by, Auto and the radios', un.every((x) => !x), un);
  await click(await ev(() => window.__icon('linenums', 'button:OK')));
  await page.waitForFunction(() => !window.__box('linenums'));
  const s1 = await ev(() => window.__st());
  ok('OK: w:lnNumType countBy 1 on the section, the Line Number style added, one undo step',
    JSON.stringify(s1.ln) === '{"countBy":1}' && s1.style && s1.depth === s0.depth + 1, s1);
  const n1 = await ev(() => window.__drawn());
  ok('... and 1, 2, 3, 4 drawn in the left margin', n1 === '1,2,3,4', n1);
  ok('the Layout box is still open', s1.layout, s1);

  // ------------------------------------------------ Count by 0 refused
  await openBox();
  const v2 = await ev(() => window.__box('linenums').values());
  ok('it opens again with the numbering on', v2.on === true && v2.countby === 1, v2);
  await field('countby', '0');
  await click(await ev(() => window.__icon('linenums', 'button:OK')));
  const s2 = await ev(() => window.__st());
  ok('Count by 0: OK beeps, says why, keeps the box; nothing changed', s2.box && s2.beeps === s1.beeps + 1
    && /Count by/.test(s2.msg) && s2.depth === s1.depth && JSON.stringify(s2.ln) === '{"countBy":1}', s2);

  // ------------------------------------------------ malformed text refused
  let sb = s2;
  for (const [name, text] of [['countby', '1.2.3'], ['countby', '-'], ['start', '5-']]) {
    await field(name, text);
    await click(await ev(() => window.__icon('linenums', 'button:OK')));
    const s = await ev(() => window.__st());
    ok(`${name} "${text}": OK beeps, says why, keeps the box; nothing changed`, s.box && s.beeps === sb.beeps + 1
      && /^(Count by|Start at)/.test(s.msg) && s.depth === s1.depth && JSON.stringify(s.ln) === '{"countBy":1}', s);
    sb = s;
    await field(name, '1');
  }
  await click(await ev(() => window.__icon('linenums', 'auto')));
  for (const text of ['1..5', '.', '3 in in']) {
    await field('dist', text);
    await click(await ev(() => window.__icon('linenums', 'button:OK')));
    const s = await ev(() => window.__st());
    ok(`From text "${text}" (Auto off): OK beeps, says why, keeps the box; nothing changed`, s.box
      && s.beeps === sb.beeps + 1 && /^From text/.test(s.msg) && s.depth === s1.depth
      && JSON.stringify(s.ln) === '{"countBy":1}', s);
    sb = s;
  }
  await click(await ev(() => window.__icon('linenums', 'auto')));
  await field('countby', '1.2.3');
  await click(await ev(() => window.__icon('linenums', 'rcont')));
  await click(await ev(() => window.__icon('linenums', 'button:OK')));
  const s2b = await ev(() => window.__st());
  ok('Count by "1.2.3" with Continuous clicked: refused, Continuous not applied either', s2b.box
    && s2b.beeps === sb.beeps + 1 && s2b.depth === s1.depth && JSON.stringify(s2b.ln) === '{"countBy":1}', s2b);

  // ------------------------------------------------ Count by 2, Continuous
  await field('countby', '2');
  await click(await ev(() => window.__icon('linenums', 'rcont')));
  await press('Enter');
  await page.waitForFunction(() => !window.__box('linenums'));
  const s3 = await ev(() => window.__st());
  const n3 = await ev(() => window.__drawn());
  ok('Count by 2 and Continuous: countBy 2 restart continuous, one more step; 2 and 4 drawn',
    JSON.stringify(s3.ln) === '{"countBy":2,"restart":"continuous"}' && s3.depth === s1.depth + 1 && n3 === '2,4', { s3, n3 });

  // ------------------------------------------------ the Layout box is not stale
  await click(await ev(() => window.__icon('layout', 'button:OK')));
  const s4 = await ev(() => window.__st());
  ok('the Layout box\'s OK after them: no beep, the box gone, no step', !s4.layout && s4.beeps === s3.beeps
    && s4.depth === s3.depth, s4);

  // ------------------------------------------------ off
  await openBox();
  await click(await ev(() => window.__icon('linenums', 'on')));
  await click(await ev(() => window.__icon('linenums', 'button:OK')));
  await page.waitForFunction(() => !window.__box('linenums'));
  const s5 = await ev(() => window.__st());
  const n5 = await ev(() => window.__drawn());
  ok('Add line numbering off: w:lnNumType gone, one step, no numbers drawn', s5.ln === null && s5.depth === s4.depth + 1
    && n5 === '', { s5, n5 });
  await ev(() => window.__menu('Format', 'Layout...'));
  await press('Escape');
  await ev(() => window.__doc().win.focus?.());
  await press('Control+z');
  const s6 = await ev(() => window.__st());
  const n6 = await ev(() => window.__drawn());
  ok('Ctrl-Z: count by 2 back', JSON.stringify(s6.ln) === '{"countBy":2,"restart":"continuous"}' && n6 === '2,4', { s6, n6 });
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
