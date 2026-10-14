// !Letters' column breaks (Batch D P10.3, D22), by real keys and the
// real Insert menu, in a document of two newspaper columns opened in
// Print layout: Ctrl+Shift+Enter outside a table puts a column break
// at the caret (one undo step, the paragraph split after it) and the
// text after it is drawn at the top of column 2 (by its place and by
// the texts drawn there); Ctrl-Z puts it back; Insert > Column break
// shows the key and does the same; in a table's cell Ctrl+Shift+Enter
// still splits the table (no column break); in the header and footer
// mode it beeps and changes nothing, and the menu item is shaded; the
// saved file has <w:br w:type="column"/>. The Columns box (P10.4,
// D23): Format > Columns... opens it (at least 3.4 inches, 612 px,
// wide) with the section's columns (Two, equal, 0.5" apart, Whole
// document); the Left preset puts Word's widths in (1.83" and 4.17")
// and OK writes them (equalWidth 0, one undo step, the box gone,
// column 2 drawn further right); Ctrl-Z puts the equal columns back;
// Number 46 beeps, says why and keeps the box; a box left open while
// the caret moves beeps on OK, is filled again and kept; Three and
// Line between then go in on Return and are saved as Word writes
// them. Needs the disc built by
// tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { tbl, tr, tc } from './tbl-fixtures.mjs';
import { readZip } from '../../tools/moreapps/!WimpLib/Zip';

const MAR = 'w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"';
const SECT = `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar ${MAR}/><w:cols w:num="2" w:space="720"/></w:sectPr>`;
const BODY = p(r('First words then the second part')) + p(r('Another paragraph here'))
  + tbl([tr([tc(p(r('Cell A1'))), tc(p(r('Cell B1')))]), tr([tc(p(r('Cell A2'))), tc(p(r('Cell B2')))])])
  + p(r('Last paragraph')) + SECT;
const files = { Cols: Array.from(await buildDocx({ 'word/document.xml': documentXml(BODY) })) };

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);

const { browser, page, logs } = await launch({ height: 1000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const press = async (k) => { await page.keyboard.press(k); await ev(() => window.__frames(3)); };
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async (files) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = () => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === 'Cols');
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    /** The body paragraph whose text starts with t: [its block, its index among the body's blocks]. */
    window.__para = (t) => {
      const bs = window.__doc().dw.doc.sections.flatMap((s) => s.blocks);
      const k = bs.findIndex((b) => b.type === 'p' && b.text.startsWith(t));
      return [bs[k], k];
    };
    /** What the tests look at: the body, the step count, the caret, the columns of page 1. */
    window.__st = () => {
      const d = window.__doc(), v = d.dw.view, L = d.dw.L, P = L.place.pages;
      P.finish();
      const pg = P.at(0), bs = d.dw.doc.sections.flatMap((s) => s.blocks);
      const it = v.sel && L.byId.get(v.sel.head.id);
      return { body: bs.map((b) => (b.type === 'p' ? b.text : '#' + b.type)), depth: d.d.undoDepth, beeps: window.__beeps,
        caret: it ? { text: it.block.text, off: v.sel.head.off, k: it.index } : null,
        cols: (pg.cols || []).map((c) => ({ x: c.x, k: c.start.k, line: c.start.line, why: c.why })),
        brs: bs.filter((b) => b.type === 'p').flatMap((b) => Object.values(b.inlines || {}))
          .filter((x) => x.kind === 'br').map((x) => x.brType), hdr: !!v.hdr };
    };
    /** The texts drawn on page 1 with their work-area x (fillText spied on, put back). */
    window.__drawn = async () => {
      const d = window.__doc(), cv = d.win._canvas, k = cv.width / d.win.w;
      const proto = CanvasRenderingContext2D.prototype, real = proto.fillText, seen = [];
      proto.fillText = function (t, x, y, ...a) {
        if (this.canvas === cv) {
          const m = this.getTransform();
          seen.push([String(t), (m.a * x + m.c * y + m.e) / k + d.win.scrollX]);
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
      return seen;
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
    await window.__word().word.open('RAM::RamDisc0.$.Cols');
    await window.__frames(3);
    window.__doc().win.open({ x: 60, y: 40, w: 1000, h: 800, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
  }, files);

  // ------------------------------------------------ Ctrl+Shift+Enter outside a table
  const s0 = await ev(() => {
    const d = window.__doc(), [b] = window.__para('First words');
    d.dw.view.setSelection({ anchor: { id: b.id, off: 12 }, head: { id: b.id, off: 12 } });
    return { view: d.viewName, ...window.__st() };
  });
  ok('a two-column document opens in Print layout, its text all in column 1', s0.view === 'print' && s0.cols.length >= 1
    && s0.cols.every((c) => c.k === 0 || c.why !== 'break'), s0);
  await press('Control+Shift+Enter');
  const s1 = await ev(() => window.__st());
  ok('Ctrl+Shift+Enter: a column break at the caret, the paragraph split after it, one undo step, the caret at the '
    + 'start of the new paragraph', s1.depth === s0.depth + 1 && s1.body[0] === 'First words ￼' && s1.body[1] === 'then the second part'
    && s1.brs.join() === 'column' && s1.caret && s1.caret.k === 1 && s1.caret.off === 0, s1);
  ok('... column 1 ends at the break; column 2 starts with the text after it', s1.cols.length === 2 && s1.cols[0].why === 'break'
    && s1.cols[1].k === 1 && s1.cols[1].line === 0 && s1.cols[1].x > s1.cols[0].x, s1.cols);
  const dr = await ev(async () => {
    const seen = await window.__drawn(), d = window.__doc(), L = d.dw.L, pg = L.place.pages.at(0), rc = L.place.sheet.rect(pg);
    const xOf = (re) => seen.filter(([t]) => re.test(t)).map(([, x]) => x);
    return { first: xOf(/First/), then: xOf(/then|second/), mid: rc.x + pg.cols[1].x - 4 };
  });
  ok('... drawn: "First words" in column 1, "then the second part" in column 2', dr.first.length > 0 && dr.then.length > 0
    && dr.first.every((x) => x < dr.mid) && dr.then.every((x) => x >= dr.mid), dr);
  await press('Control+z');
  const s2 = await ev(() => window.__st());
  ok('Ctrl-Z: as it was', s2.depth === s0.depth && JSON.stringify(s2.body) === JSON.stringify(s0.body) && s2.brs.length === 0, s2);

  // ------------------------------------------------ Insert > Column break
  const m1 = await ev(async () => {
    const d = window.__doc(), v = d.dw.view, [b] = window.__para('Another');
    v.setSelection({ anchor: { id: b.id, off: 8 }, head: { id: b.id, off: 8 } });
    const ins = d.win.menu({}).items.find((i) => i.text === 'Insert').submenu();
    const items = ins.items.map((i) => i.text), it = ins.items.find((i) => i.text === 'Column break');
    const at = items.indexOf('Column break');
    const shaded = it && (typeof it.shaded === 'function' ? it.shaded() : !!it.shaded);
    if (it) it.action();
    await window.__frames(3);
    return { items, at, key: it && it.key, shaded, help: !!(it && it.help), ...window.__st() };
  });
  ok('Insert > Column break, after Page break, shows Ctrl+Shift+Enter and is live in the body', m1.at === 1 && m1.items[0] === 'Page break'
    && m1.key === 'Ctrl+Shift+Enter' && m1.shaded === false && m1.help, m1);
  ok('... it puts the break in: one undo step', m1.depth === s0.depth + 1 && m1.brs.join() === 'column'
    && m1.body.includes('Another ￼') && m1.body.includes('paragraph here'), m1);
  await press('Control+z');

  // ------------------------------------------------ in a table's cell: still Split table
  await ev(() => {
    const d = window.__doc(), bs = d.dw.doc.sections[0].blocks, t = bs.find((b) => b.type === 'tbl');
    const c = t.rows[1].cells[0].blocks[0];
    d.dw.view.setSelection({ anchor: { id: c.id, off: 2 }, head: { id: c.id, off: 2 } });
  });
  const t0 = await ev(() => window.__st());
  await press('Control+Shift+Enter');
  const t1 = await ev(() => window.__st());
  ok('in a table\'s cell Ctrl+Shift+Enter still splits the table: two tables, no column break, one undo step',
    t1.body.filter((x) => x === '#tbl').length === 2 && t1.brs.length === 0 && t1.depth === t0.depth + 1, t1);
  await press('Control+z');
  const t2 = await ev(() => window.__st());
  ok('... Ctrl-Z: one table again', t2.body.filter((x) => x === '#tbl').length === 1 && t2.depth === t0.depth, t2);

  // ------------------------------------------------ the header and footer mode: refused
  const h0 = await ev(async () => {
    const d = window.__doc();
    d.toggleHdr();
    await window.__frames(3);
    const ins = d.win.menu({}).items.find((i) => i.text === 'Insert').submenu();
    const it = ins.items.find((i) => i.text === 'Column break');
    return { shaded: it && (typeof it.shaded === 'function' ? it.shaded() : !!it.shaded), stories: JSON.stringify([...d.dw.doc.stories]
      .map(([k, s]) => [k, s.blocks.map((b) => b.text)])), ...window.__st() };
  });
  await press('Control+Shift+Enter');
  const h1 = await ev(() => {
    const d = window.__doc();
    return { stories: JSON.stringify([...d.dw.doc.stories].map(([k, s]) => [k, s.blocks.map((b) => b.text)])), ...window.__st() };
  });
  ok('in the header and footer mode Insert > Column break is shaded', h0.hdr && h0.shaded === true, h0);
  ok('... and Ctrl+Shift+Enter beeps and changes nothing', h1.hdr && h1.beeps === h0.beeps + 1 && h1.depth === h0.depth
    && h1.stories === h0.stories && h1.brs.length === 0, { h0, h1 });
  await ev(async () => { window.__doc().toggleHdr(); await window.__frames(2); });

  // ------------------------------------------------ saved as <w:br w:type="column"/>
  await ev(() => {
    const d = window.__doc(), [b] = window.__para('Last');
    d.dw.view.setSelection({ anchor: { id: b.id, off: 4 }, head: { id: b.id, off: 4 } });
  });
  await press('Control+Shift+Enter');
  const bytes = await ev(async () => Array.from(await window.__doc().saveBytes()));
  const xml = new TextDecoder().decode((await readZip(new Uint8Array(bytes))).get('word/document.xml'));
  const at = xml.indexOf('w:type="column"');
  ok('saved: the break is <w:br w:type="column"/> in a run, after "Last"', /<w:t>Last<\/w:t>(<\/w:r><w:r>)?<w:br w:type="column"\/><\/w:r>/.test(xml),
    xml.slice(Math.max(0, at - 200), at + 40));

  // ------------------------------------------------ the Columns box (P10.4)
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  const settle = () => ev(() => window.__frames(2));
  const click = async (q) => { await page.mouse.click(q.x, q.y); await wait(60); await settle(); };
  await ev(() => {
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__box = () => {
      const d = window.__doc();
      return d && d.dw.boxes.has('columns') ? window.__word().word.dialog({ key: 'columns:' + d.docKey, rows: [] }) : null;
    };
    window.__icon = (name) => {
      const w = window.__box().win, b = w.iconByName(name).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    window.__colsMenu = () => {
      const d = window.__doc(), m = d.win.menu({}).items.find((i) => i.text === 'Format').submenu();
      const it = m.items.find((i) => i.text === 'Columns...');
      if (!it || (typeof it.shaded === 'function' ? it.shaded(it) : it.shaded)) return false;
      it.action(it);
      return true;
    };
    window.__cs = () => {
      const d = window.__doc(), c = d.dw.doc.sections[d.dw.doc.sections.length - 1].props.cols, b = window.__box();
      return { ...window.__st(), cols: c ? JSON.parse(JSON.stringify(c)) : null, box: !!b && b.isOpen,
        msg: b ? b.get('msg') : null };
    };
  });
  const field = async (name, text) => {
    await click(await ev((n) => window.__icon(n), name));
    await press('End');
    for (let i = 0; i < 12; i++) await page.keyboard.press('Backspace');
    if (text) await page.keyboard.type(text);
    await settle();
  };
  const c0 = await ev(() => window.__cs());
  const opened = await ev(() => window.__colsMenu());
  await settle();
  const b0 = await ev(() => { const b = window.__box(); return b && { open: b.isOpen, title: b.win.title, w: b.win.w, v: b.values(),
    shaded: ['w2', 's2', 'w3', 's3'].map((n) => b.win.iconByName(n).shaded) }; });
  ok('Format > Columns... opens the Columns box, at least 3.4 inches (612 px) wide', opened && b0 && b0.open
    && b0.title === 'Columns' && b0.w >= 612, b0);
  ok('... with the section\'s columns: Two, 2, equal, 3" wide 0.5" apart, no line, Whole document', b0 && b0.v.preset === 'two'
    && b0.v.num === 2 && b0.v.equal === true && b0.v.w1 === 4320 && b0.v.s1 === 720 && b0.v.sep === false
    && b0.v.scope === 'all' && b0.v.msg === '', b0);
  await click(await ev(() => window.__icon('left')));
  const b1 = await ev(() => window.__box().values());
  ok('the Left preset puts Word\'s widths in: 1.83" then 4.17" (shown to 1/100 inch), not equal, Left chosen',
    b1.num === 2 && b1.equal === false && b1.preset === 'left' && Math.abs(b1.w1 - 2640) < 8 && b1.s1 === 720
    && Math.abs(b1.w2 - 6000) < 8, b1);
  await click(await ev(() => window.__icon('button:OK')));
  await ev(() => window.__frames(4));
  const c1 = await ev(() => window.__cs());
  ok('OK: the columns written as Word does (equalWidth 0, two w:col), one undo step, the box gone', !c1.box
    && c1.depth === c0.depth + 1 && c1.cols.equalWidth === false
    && JSON.stringify(c1.cols.col) === JSON.stringify([{ w: 2640, space: 720 }, { w: 6000 }]), c1);
  const gap = await ev(() => { const P = window.__doc().dw.L.place.pages; P.finish(); const pg = P.at(0); return pg.cols ? pg.cols.map((c) => c.x) : null; });
  ok('... Print layout: column 2 at 224 px from column 1', gap && gap.length === 2 && Math.abs(gap[1] - gap[0] - 224) < 1, gap);
  await press('Control+z');
  const c2 = await ev(() => window.__cs());
  ok('Ctrl-Z: two equal columns again', c2.depth === c0.depth && JSON.stringify(c2.cols) === JSON.stringify(c0.cols), c2);

  // refused: 46 columns
  await ev(() => window.__colsMenu());
  await settle();
  await field('num', '46');
  const bp = (await ev(() => window.__cs())).beeps;
  await click(await ev(() => window.__icon('button:OK')));
  const c3 = await ev(() => window.__cs());
  ok('Number 46: OK beeps, says why, keeps the box, changes nothing', c3.box && c3.beeps === bp + 1 && /1 to 45/.test(c3.msg)
    && c3.depth === c0.depth, c3);

  // a stale box is filled again
  await ev(() => { const d = window.__doc(), [b] = window.__para('Another'); d.dw.view.setSelection({ anchor: { id: b.id, off: 1 }, head: { id: b.id, off: 1 } }); });
  await settle();
  await click(await ev(() => window.__icon('button:OK')));
  const c4 = await ev(() => ({ ...window.__cs(), v: window.__box()?.values() }));
  ok('the caret moved while the box was open: OK beeps, keeps the box and shows the columns again (2)', c4.box
    && c4.beeps === c3.beeps + 1 && c4.depth === c0.depth && c4.v.num === 2 && /changed/.test(c4.msg), c4);
  await click(await ev(() => window.__icon('three')));
  await click(await ev(() => window.__icon('sep')));
  await press('Enter');
  const c5 = await ev(() => window.__cs());
  ok('Three and Line between, Return: three equal columns with a line, one step', !c5.box && c5.depth === c0.depth + 1
    && JSON.stringify(c5.cols) === JSON.stringify({ num: 3, sep: true, space: 720 }), c5);
  const bytes2 = await ev(async () => Array.from(await window.__doc().saveBytes()));
  const xml2 = new TextDecoder().decode((await readZip(new Uint8Array(bytes2))).get('word/document.xml'));
  ok('saved: <w:cols w:num="3" w:sep="1" w:space="720"/>', xml2.includes('<w:cols w:num="3" w:sep="1" w:space="720"/>'),
    (xml2.match(/<w:cols[^>]*>/) || [])[0]);

  const msgs = await ev(() => window.__msgs);
  ok('no error reported', msgs.length === 0, msgs);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
