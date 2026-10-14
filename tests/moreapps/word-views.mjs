// !Letters' Web layout in the real desktop (Batch D P13.1, D31, OD8):
// a file whose settings say w:view web opens in Web layout (no pages,
// the lines broken at the window's width minus 0.25 in each side and an
// 8 px inset inside the white area, final fix B); View >
// Web layout is enabled and chosen from Print layout, and back; a window
// resize re-breaks the lines, throttled to one relayout per 200 ms; a
// 20,000-paragraph document resized lays out the visible part first and
// the rest in slices that end with every line at the new width; the
// bytes saved after Web layout are identical (every part).
// Outline (P13.2, D32): w:view outline opens in Outline, View > Outline
// is a radio; paragraphs indented 0.25 in per level with + / - / o
// markers; the window's collapse set hides a heading's children; View
// > Draft takes the indents away; the bytes saved are identical.
// Outline commands (P13.3): Shift-Tab / Tab at a heading's start
// promote and demote it; Ctrl-Shift-Up / Down move a paragraph past a
// collapsed heading whole; at the top a beep and nothing changed;
// Ctrl-Z undoes a move; in Draft Ctrl-Shift-Up only selects.
// Outline menu (P13.4): Show level 2 hides body text (and the caret goes to
// the heading), All shows it again; a double-click on a marker collapses
// and expands that heading; Expand and Collapse by the menu; Show first
// line only keeps a line a paragraph; Promote / Demote / Move in the menu;
// the collapse set is never written to the file (bytes identical).
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, settingsXml, p, r } from './build-docx.mjs';
import { readZip } from '../../tools/moreapps/!WimpLib/Zip';

const SECT = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" '
  + 'w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const text = (i, n) => Array.from({ length: n }, (_, j) => WORDS[(i + j) % 10]).join(' ');
const MANY = Array.from({ length: 40 }, (_, i) => p(r(`${i} ` + text(i, 40)))).join('') + SECT;
const lvl = (n) => `<w:outlineLvl w:val="${n}"/>`;
const OUTL = p(r('Alpha'), lvl(0)) + p(r('a1')) + p(r('Alpha.1'), lvl(1)) + p(r('a11')) + p(r('Beta'), lvl(0))
  + p(r('b1')) + SECT;
const LONGP = 'word '.repeat(120);
const OFOLD = p(r('Alpha'), lvl(0)) + p(r('a1')) + p(r('Alpha.1'), lvl(1)) + p(r('a11')) + p(r('Beta'), lvl(0))
  + p(r('b1')) + p(r(LONGP)) + SECT;
const BIG = Array.from({ length: 20000 }, (_, i) => p(r(`${i} ` + text(i, 20)))).join('') + SECT;
const files = {
  Web: await buildDocx({ 'word/document.xml': documentXml(MANY),
    'word/settings.xml': settingsXml('<w:view w:val="web"/><w:zoom w:percent="100"/>') }),
  Print: await buildDocx({ 'word/document.xml': documentXml(MANY) }),
  Next: await buildDocx({ 'word/document.xml': documentXml(MANY) }),
  Outl: await buildDocx({ 'word/document.xml': documentXml(OUTL),
    'word/settings.xml': settingsXml('<w:view w:val="outline"/>') }),
  OCmd: await buildDocx({ 'word/document.xml': documentXml(OUTL),
    'word/settings.xml': settingsXml('<w:view w:val="outline"/>') }),
  OFold: await buildDocx({ 'word/document.xml': documentXml(OFOLD),
    'word/settings.xml': settingsXml('<w:view w:val="outline"/>') }),
  Big: await buildDocx({ 'word/document.xml': documentXml(BIG),
    'word/settings.xml': settingsXml('<w:view w:val="web"/>') }),
};
for (const k of Object.keys(files)) files[k] = Array.from(files[k]);

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const { browser, page, logs } = await launch({ height: 1000 });
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
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => d.leaf === leaf);
    window.__open = async (leaf) => {
      await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      await window.__frames(3);
      return window.__doc(leaf);
    };
    window.__view = (d, text) => {
      const m = d.win.menu({}).items.find((i) => i.text === 'View').submenu();
      const it = m.items.find((i) => i.text === text);
      it.action(it);
    };
    window.__viewRows = (d) => d.win.menu({}).items.find((i) => i.text === 'View').submenu().items.map((i) => [i.text,
      !!(typeof i.ticked === 'function' ? i.ticked(i) : i.ticked), !!(typeof i.shaded === 'function' ? i.shaded(i) : i.shaded)]);
    /** A line's right edge (a trailing space may overhang: 9 px). */
    window.__right = (ln) => ln.items.reduce((m, i) => Math.max(m, i.x + i.w), 0);
    /** The widest line of any paragraph, and the layout's width. */
    window.__fit = (d, n = 40) => {
      const L = d.view.layout;
      let wide = 0, lines = 0;
      for (const it of L.items.slice(0, n)) for (const ln of it.lines) { wide = Math.max(wide, window.__right(ln)); lines++; }
      return { wide, lines, w: L.items[0].w, left: L.items[0].x, web: L.web || null };
    };
    /** Resize d's window to width w (as the user drags its size box). */
    window.__resize = async (d, w) => {
      d.win.open({ x: d.win.x, y: d.win.y, w, h: d.win.h, behind: 'top' });
      await window.__frames(2);
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
  }, files);

  // ------------------------------------------------ w:view web opens in Web layout
  const o1 = await ev(async () => {
    const d = await window.__open('Web');
    const vw = Math.round(d.win.w) / d.view.zoom;
    return { view: d.viewName, pages: d.view.pages(), fit: window.__fit(d), vw, info: d.pageInfo,
      rows: window.__viewRows(d).slice(0, 4) };
  });
  ok('w:view web opens in Web layout: no pages, no page info',
    o1.view === 'web' && o1.pages === null && !/^Page/.test(o1.info || ''), o1);
  ok('the lines are broken at the window width minus 0.25 in each side and the 8 px inset (the text 32 px in)',
    Math.abs(o1.fit.w - (o1.vw - 64)) < 1 && o1.fit.left === 32 && o1.fit.wide <= o1.fit.w + 9 && o1.fit.lines > 40, o1);
  ok('View: Web layout ticked and enabled, Print layout, Outline and Draft enabled',
    same(o1.rows, [['Print layout', false, false], ['Web layout', true, false], ['Outline', false, false], ['Draft', false, false]]), o1);

  // ------------------------------------------------ a resize re-breaks; throttled to one relayout per 200 ms
  const z1 = await ev(async () => {
    const d = window.__doc('Web'), res = { a: window.__fit(d) };
    await window.__resize(d, 500);
    await window.__sleep(300);
    await window.__frames(2);
    res.b = window.__fit(d);
    res.vw = Math.round(d.win.w) / d.view.zoom;
    return res;
  });
  ok('a narrower window: the paragraphs re-break to it (more lines, none wider than the window less 0.5 in and the insets)',
    z1.b.lines > z1.a.lines && Math.abs(z1.b.w - (z1.vw - 64)) < 1 && z1.b.wide <= z1.b.w + 9, z1);
  const t1 = await ev(async () => {
    const d = window.__doc('Web'), L0 = d.view.layout, n0 = d.dw.webRuns || 0;
    for (const w of [560, 580, 600, 620, 640, 660]) {
      d.win.open({ x: d.win.x, y: d.win.y, w, h: d.win.h, behind: 'top' });
      await window.__frames(1);
    }
    const early = d.dw.webRuns - n0;
    await window.__sleep(500);
    await window.__frames(2);
    const vw = Math.round(d.win.w) / d.view.zoom;
    return { early, total: d.dw.webRuns - n0, w: d.view.layout.items[0].w, vw };
  });
  ok('six resizes within 0.2 s: at most one relayout meanwhile, and the last one catches up',
    t1.early <= 1 && t1.total >= 1 && t1.total <= 3 && Math.abs(t1.w - (t1.vw - 64)) < 1, t1);

  // ------------------------------------------------ View > Print layout and back to Web layout
  const v1 = await ev(async () => {
    const d = await window.__open('Print'), res = { start: d.viewName, rows: window.__viewRows(d).slice(0, 4) };
    window.__view(d, 'Web layout');
    await window.__frames(3);
    res.web = d.viewName;
    res.pages = d.view.pages();
    res.fit = window.__fit(d);
    res.vw = Math.round(d.win.w) / d.view.zoom;
    const n = await window.__open('Next');
    res.next = n.viewName;
    n.dw.close();
    window.__view(d, 'Print layout');
    await window.__frames(3);
    res.back = d.viewName;
    res.pagesBack = !!d.view.pages();
    return res;
  });
  ok('Print layout: View > Web layout is not shaded; chosen, the window shows Web layout (no pages, width of the window), and the next window opens in it',
    v1.start === 'print' && same(v1.rows[1], ['Web layout', false, false]) && v1.web === 'web' && v1.pages === null
    && Math.abs(v1.fit.w - (v1.vw - 64)) < 1 && v1.next === 'web', v1);
  ok('... and View > Print layout brings the pages back', v1.back === 'print' && v1.pagesBack, v1);

  // ------------------------------------------------ saving is byte-identical
  const s1 = await ev(async () => {
    const d = window.__doc('Print');
    const a = await d.saveBytes();
    window.__view(d, 'Web layout');
    await window.__frames(3);
    await window.__resize(d, 400);
    await window.__sleep(300);
    const b = await d.saveBytes();
    window.__view(d, 'Print layout');
    await window.__frames(3);
    return { zips: [a, b].map((x) => Array.from(x)), dirty: d.view.dirty };
  });
  {
    const [za, zb] = await Promise.all(s1.zips.map((x) => readZip(new Uint8Array(x))));
    const eq = za.size === zb.size && [...za].every(([n, v]) => {
      const u = zb.get(n);
      return u && u.length === v.length && u.every((q, i) => q === v[i]);
    });
    ok('the file saved after Web layout (and a resize) has every part byte-identical; not marked changed', eq && !s1.dirty, { eq, dirty: s1.dirty });
  }
  await ev(() => { window.__doc('Web').dw.close(); window.__doc('Print').dw.close(); });

  // ------------------------------------------------ 20,000 paragraphs: the visible part first, the rest in slices
  const b1 = await ev(async () => {
    const t0 = performance.now();
    const d = await window.__open('Big');
    const res = { open: Math.round(performance.now() - t0), view: d.viewName };
    for (let i = 0; i < 4000 && d.view.layout.stale; i++) await window.__frames(1);
    res.stale0 = d.view.layout.stale || 0;
    const L0 = d.view.layout;
    res.before = L0.items[100].lines.length;
    d.win.open({ x: d.win.x, y: d.win.y, w: 420, h: d.win.h, behind: 'top' });
    const t1 = performance.now();
    await window.__frames(1);
    res.first = Math.round(performance.now() - t1);
    const L1 = d.view.layout;
    res.waiting = L1.stale || 0;
    res.visible = L1.items.slice(0, 20).every((it) => it.lines.every((l) => window.__right(l) <= it.w + 9) && !it.stale);
    res.lastLines = L1.items[19999].lines.length;
    let frames = 0;
    for (; frames < 6000 && d.view.layout.stale; frames++) await window.__frames(1);
    res.frames = frames;
    const L2 = d.view.layout;
    res.done = L2.stale || 0;
    res.after = L2.items[100].lines.length;
    res.fits = [0, 100, 9999, 19999].every((i) => L2.items[i].lines.every((l) => window.__right(l) <= L2.items[i].w + 9));
    res.ext = d.win.extent.y1 - d.win.extent.y0 >= L2.height - 1;
    d.dw.close();
    return res;
  });
  ok('Big document: opens in Web layout; its first screen after a resize waits for most paragraphs',
    b1.view === 'web' && b1.stale0 === 0 && b1.waiting > 1000, b1);
  ok('... the visible paragraphs already at the new width; the slices finish: every line at the new width, more lines than before',
    b1.visible && b1.done === 0 && b1.fits && b1.after > b1.before && b1.ext && b1.frames > 1, b1);

  // ------------------------------------------------ Outline (P13.2)
  const ol = await ev(async () => {
    const d = await window.__open('Outl'), res = { view: d.viewName, rows: window.__viewRows(d).slice(0, 4) };
    const rows = (L) => L.items.map((it) => [it.block.text, it.level, it.x - L.left, it.marker]);
    res.items = rows(d.view.layout);
    res.pages = d.view.pages();
    res.bytes0 = Array.from(await d.saveBytes());
    const ids = d.view.layout.items.map((it) => it.id);
    d.dw.collapsed = new Set([ids[0]]);
    d.dw.fit();
    await window.__frames(2);
    res.shut = rows(d.view.layout);
    res.flow = d.view.layout.flow.map((it) => it.block.text);
    res.bytes1 = Array.from(await d.saveBytes());
    window.__view(d, 'Draft');
    await window.__frames(3);
    res.draft = rows(d.view.layout);
    res.kept = d.dw.collapsed.has(ids[0]);
    window.__view(d, 'Outline');
    await window.__frames(3);
    res.again = d.view.layout.items.length;
    res.dirty = d.view.dirty;
    d.dw.close();
    return res;
  });
  ok('w:view outline opens in Outline (no pages); View > Outline ticked and enabled',
    ol.view === 'outline' && ol.pages === null && same(ol.rows[2], ['Outline', true, false]), ol);
  ok('Outline: 0.25 in (24 px) per level, body text one step under its heading, + / - / o markers',
    same(ol.items, [['Alpha', 0, 0, '-'], ['a1', 9, 24, 'o'], ['Alpha.1', 1, 24, '-'], ['a11', 9, 48, 'o'],
      ['Beta', 0, 0, '-'], ['b1', 9, 24, 'o']]), ol.items);
  ok('a collapsed heading: its children have no items and are not in the flow; its marker is +',
    same(ol.shut, [['Alpha', 0, 0, '+'], ['Beta', 0, 0, '-'], ['b1', 9, 24, 'o']]) && same(ol.flow, ['Alpha', 'Beta', 'b1']), ol);
  ok('View > Draft: no indents or markers, every paragraph; the collapse set kept for the window and shown again in Outline',
    ol.draft.length === 6 && ol.draft.every((x) => x[2] === 0 && x[3] === undefined) && ol.kept && ol.again === 3, ol);
  {
    const [za, zb] = await Promise.all([ol.bytes0, ol.bytes1].map((x) => readZip(new Uint8Array(x))));
    const eq = za.size === zb.size && [...za].every(([n, v]) => {
      const u = zb.get(n);
      return u && u.length === v.length && u.every((q, i) => q === v[i]);
    });
    ok('Outline never changes what is saved (every part byte-identical, collapsed or not); not marked changed', eq && !ol.dirty, { eq });
  }

  // ------------------------------------------------ Outline commands (P13.3)
  const press = async (k) => { await page.keyboard.press(k); await ev(() => window.__frames(2)); };
  await ev(async () => {
    const d = await window.__open('OCmd');
    window.__beeps = 0;
    window.__beep0 = os.wimp.beep;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    window.__otexts = (d) => d.doc.sections.flatMap((s) => s.blocks.map((b) => b.text));
    window.__oat = (d, text, off = 0) => {
      const b = d.doc.sections[0].blocks.find((x) => x.text.replace('\t', '') === text);
      d.view.setSelection({ id: b.id, off });
    };
    window.__olevel = (d, text) => d.view.layout.items.find((it) => it.block.text.replace('\t', '') === text)?.level;
    window.__oat(d, 'Alpha.1');
  });
  try {
    await press('Shift+Tab');
    const oc1 = await ev(() => {
      const d = window.__doc('OCmd');
      const res = { lvl: window.__olevel(d, 'Alpha.1'), dirty: d.view.dirty };
      window.__oat(d, 'Alpha.1', 2);
      return res;
    });
    await press('Tab');
    const oc2 = await ev(() => {
      const d = window.__doc('OCmd'), b = d.doc.sections[0].blocks[2];
      const res = { text: b.text, lvl: window.__olevel(d, 'Alpha.1') };
      window.__oat(d, 'Alpha.1');
      return res;
    });
    await press('Tab');
    const oc3 = await ev(() => window.__olevel(window.__doc('OCmd'), 'Alpha.1'));
    ok('Outline: Shift-Tab at a heading\'s start promotes it (level 1 -> 0), the document changed',
      oc1.lvl === 0 && oc1.dirty, oc1);
    ok('... Tab inside the heading types a tab; Tab at its start demotes it again',
      oc2.text === 'Al\tpha.1' && oc2.lvl === 0 && oc3 === 1, { oc2, oc3 });
    await ev(async () => {
      const d = window.__doc('OCmd');
      d.dw.collapsed = new Set([d.doc.sections[0].blocks[0].id]);
      d.dw.fit();
      await window.__frames(2);
      window.__oat(d, 'Beta', 1);
    });
    await press('Control+Shift+ArrowUp');
    const om1 = await ev(() => {
      const d = window.__doc('OCmd');
      return { texts: window.__otexts(d), head: d.view.selection.head.off, beeps: window.__beeps };
    });
    ok('Ctrl-Shift-Up: Beta moves past the collapsed Alpha and all its hidden children; the caret stays in it',
      same(om1.texts, ['Beta', 'Alpha', 'a1', 'Al\tpha.1', 'a11', 'b1']) && om1.head === 1 && om1.beeps === 0, om1);
    await press('Control+Shift+ArrowUp');
    const om2 = await ev(() => ({ texts: window.__otexts(window.__doc('OCmd')), beeps: window.__beeps }));
    ok('... at the top: a beep, nothing changed', om2.beeps === 1 && same(om2.texts, om1.texts), om2);
    await press('Control+z');
    const om3 = await ev(() => window.__otexts(window.__doc('OCmd')));
    ok('Ctrl-Z undoes the move', same(om3, ['Alpha', 'a1', 'Al\tpha.1', 'a11', 'Beta', 'b1']), om3);
    await ev(async () => {
      const d = window.__doc('OCmd');
      window.__view(d, 'Draft');
      await window.__frames(3);
      window.__oat(d, 'Beta', 1);
    });
    await press('Control+Shift+ArrowUp');
    const om4 = await ev(() => {
      const d = window.__doc('OCmd'), s = d.view.selection;
      return { texts: window.__otexts(d), sel: s.anchor.off !== s.head.off || s.anchor.id !== s.head.id };
    });
    ok('Draft: Ctrl-Shift-Up extends the selection, moves nothing', om4.sel && same(om4.texts, om3), om4);
  } finally {
    await ev(() => { os.wimp.beep = window.__beep0; window.__doc('OCmd')?.dw.close(); });
  }

  // ------------------------------------------------ Outline menu (P13.4)
  await ev(() => {
    window.__client = (d, x, y) => {
      const s = d.win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__omenu = (d) => d.win.menu({}).items.find((i) => i.text === 'Outline');
    const st = (v, i) => (typeof v === 'function' ? v(i) : v);
    window.__orows = (d) => {
      const m = window.__omenu(d);
      return { shaded: !!st(m.shaded, m), items: m.submenu().items.map((i) => [i.text, !!st(i.shaded, i), !!st(i.ticked, i), i.key || '']) };
    };
    window.__opick = (d, text, sub) => {
      let m = window.__omenu(d).submenu();
      if (sub) m = m.items.find((i) => i.text === sub).submenu();
      const it = m.items.find((i) => i.text === text);
      it.action(it);
    };
    window.__oshown = (d) => d.view.layout.items.map((it) => it.block.text);
    window.__ocaret = (d, text, off = 0) => {
      const b = d.doc.sections[0].blocks.find((x) => x.text === text);
      d.view.setSelection({ id: b.id, off });
    };
    window.__omark = (d, text) => {
      const L = d.view.layout, it = L.items.find((x) => x.block.text === text), c = L.caretRect({ id: it.id, off: 0 });
      return window.__client(d, c.x - 12 * d.view.zoom, c.y + c.h / 2);
    };
  });
  try {
    const of0 = await ev(async () => {
      const d = await window.__open('OFold'), res = {};
      res.menu = window.__orows(d);
      res.top = d.win.menu({}).items.map((i) => i.text);
      res.bytes0 = Array.from(await d.saveBytes());
      window.__ocaret(d, 'a11', 2);
      window.__opick(d, 'Level 2', 'Show level');
      await window.__frames(3);
      res.l2 = window.__oshown(d);
      const s = d.view.selection, c = d.view.caretRect();
      res.caret = { text: d.doc.sections[0].blocks.find((x) => x.id === s.head.id).text, off: s.head.off, rect: !!c };
      res.dirty = d.view.dirty;
      return res;
    });
    ok('Outline menu: after View in the window menu, enabled in Outline, with Show level > and the commands, keys shown',
      !of0.menu.shaded && of0.top.indexOf('Outline') === of0.top.indexOf('View') + 1
      && same(of0.menu.items.map((i) => i[0]), ['Expand', 'Collapse', 'Show level', 'Show first line only', 'Promote', 'Demote', 'Move up', 'Move down'])
      && of0.menu.items.find((i) => i[0] === 'Promote')[3] === 'Shift+Tab'
      && of0.menu.items.find((i) => i[0] === 'Demote')[3] === 'Tab'
      && of0.menu.items.find((i) => i[0] === 'Move up')[3] === 'Ctrl+Shift+Up', of0.menu);
    ok('Show level 2: body text hidden, headings 1 and 2 shown; the caret in hidden text moves to the heading above, drawn',
      same(of0.l2, ['Alpha', 'Alpha.1', 'Beta']) && of0.caret.text === 'Alpha.1' && of0.caret.off === 7 && of0.caret.rect && !of0.dirty, of0);
    const of1 = await ev(async () => {
      const d = window.__doc('OFold'), res = {};
      res.lv = window.__orows(d).items.find((i) => i[0] === 'Show level');
      const lv = window.__omenu(d).submenu().items.find((i) => i.text === 'Show level').submenu().items;
      res.lvItems = lv.map((i) => [i.text, !!(typeof i.ticked === 'function' ? i.ticked(i) : i.ticked)]);
      window.__opick(d, 'Level 1', 'Show level');
      await window.__frames(3);
      res.l1 = window.__oshown(d);
      window.__opick(d, 'All', 'Show level');
      await window.__frames(3);
      res.all = window.__oshown(d);
      return res;
    });
    ok('Show level lists Level 1..9 and All, Level 2 ticked; Level 1 shows the top headings; All shows everything again',
      same(of1.lvItems.map((i) => i[0]), ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8', 'Level 9', 'All'])
      && same(of1.lvItems.filter((i) => i[1]).map((i) => i[0]), ['Level 2'])
      && same(of1.l1, ['Alpha', 'Beta']) && of1.all.length === 7, of1);
    // double-click a marker
    await ev(() => { const d = window.__doc('OFold'); window.__ocaret(d, 'Beta', 2); d.win.scrollTo(0, 0); });
    const m1 = await ev(() => window.__omark(window.__doc('OFold'), 'Alpha'));
    await page.mouse.dblclick(m1.x, m1.y);
    await ev(() => window.__frames(3));
    const of2 = await ev(() => { const d = window.__doc('OFold'); return { shown: window.__oshown(d), set: d.dw.collapsed.size, dirty: d.view.dirty }; });
    ok('a double-click on a + / - marker collapses the heading (children hidden, nothing typed or marked changed)',
      same(of2.shown, ['Alpha', 'Beta', 'b1', LONGP]) && of2.set === 1 && !of2.dirty, of2);
    const m2 = await ev(() => window.__omark(window.__doc('OFold'), 'Alpha'));
    await page.waitForTimeout(450);
    await page.mouse.dblclick(m2.x, m2.y);
    await ev(() => window.__frames(3));
    const of3 = await ev(() => { const d = window.__doc('OFold'); return { n: window.__oshown(d).length, set: d.dw.collapsed.size }; });
    ok('... and the marker double-clicked again expands it', of3.n === 7 && of3.set === 0, of3);
    // a double-click in the text still selects a word
    const of3b = await ev(() => { const d = window.__doc('OFold'); const c = d.view.caretRect({ id: d.view.layout.items[0].id, off: 1 }); return window.__client(d, c.x + 2, c.y + c.h / 2); });
    await page.waitForTimeout(450);
    await page.mouse.dblclick(of3b.x, of3b.y);
    const of3c = await ev(() => { const d = window.__doc('OFold'); return { n: window.__oshown(d).length, text: d.view.text() }; });
    ok('a double-click on the text is not on a marker: it selects the word', of3c.n === 7 && of3c.text === 'Alpha', of3c);
    // Collapse and Expand by the menu
    const of4 = await ev(async () => {
      const d = window.__doc('OFold'), res = {};
      window.__ocaret(d, 'a1', 1);
      window.__opick(d, 'Collapse');
      await window.__frames(3);
      res.col = window.__oshown(d);
      res.caret = d.doc.sections[0].blocks.find((x) => x.id === d.view.selection.head.id).text;
      window.__opick(d, 'Expand');
      await window.__frames(3);
      res.exp = window.__oshown(d).length;
      window.__ocaret(d, 'b1', 0);
      window.__opick(d, 'Expand');           // nothing collapsed: a beep
      return res;
    });
    ok('Collapse on body text shuts the heading above it, the caret goes to that heading; Expand opens it',
      same(of4.col, ['Alpha', 'Beta', 'b1', LONGP]) && of4.caret === 'Alpha' && of4.exp === 7, of4);
    // Show first line only
    const of5 = await ev(async (LONGP) => {
      const d = window.__doc('OFold'), res = {};
      const h = () => d.view.layout.items[6].h;
      res.h0 = h();
      res.n0 = d.view.layout.items[6].lines.length;
      window.__ocaret(d, LONGP, 400);
      window.__opick(d, 'Show first line only');
      await window.__frames(3);
      res.n1 = d.view.layout.items[6].lines.length;
      res.h1 = h();
      res.ticked = window.__orows(d).items.find((i) => i[0] === 'Show first line only')[2];
      const c = d.view.caretRect(), it = d.view.layout.items[6];
      res.caret = !!c && c.y <= it.y + it.h;
      res.bytes1 = Array.from(await d.saveBytes());
      res.dirty = d.view.dirty;
      window.__opick(d, 'Show first line only');
      await window.__frames(3);
      res.n2 = d.view.layout.items[6].lines.length;
      return res;
    }, LONGP);
    ok('Show first line only: each paragraph one line, ticked, the caret in the rest drawn on the first line; again shows all',
      of5.n0 > 1 && of5.n1 === 1 && of5.h1 < of5.h0 && of5.ticked && of5.caret && of5.n2 === of5.n0 && !of5.dirty, of5);
    {
      const [za, zb] = await Promise.all([of0.bytes0, of5.bytes1].map((x) => readZip(new Uint8Array(x))));
      const eq = za.size === zb.size && [...za].every(([n, v]) => {
        const u = zb.get(n);
        return u && u.length === v.length && u.every((q, i) => q === v[i]);
      });
      ok('Show level, collapse, first line only: every part saved byte-identical', eq, { eq });
    }
    // Promote / Move through the menu; the menu is shaded outside Outline
    const of6 = await ev(async () => {
      const d = window.__doc('OFold'), res = {};
      window.__ocaret(d, 'Beta', 2);
      window.__opick(d, 'Move up');
      await window.__frames(2);
      res.up = d.doc.sections[0].blocks.map((b) => b.text).slice(2, 5);
      window.__opick(d, 'Demote');
      await window.__frames(2);
      res.lvl = d.view.layout.items.find((it) => it.block.text === 'Beta').level;
      d.dw.view.run('undo'); d.dw.view.run('undo');
      window.__view(d, 'Draft');
      await window.__frames(3);
      res.shaded = window.__orows(d).shaded;
      return res;
    });
    ok('Move up and Demote in the menu work (Mac fallback for the keys); the Outline menu is shaded in Draft',
      same(of6.up, ['Alpha.1', 'Beta', 'a11']) && of6.lvl === 1 && of6.shaded, of6);
  } finally {
    await ev(() => window.__doc('OFold')?.dw.close());
  }

  const msgs = await ev(() => window.__msgs);
  ok('nothing reported', !msgs.length, msgs);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
