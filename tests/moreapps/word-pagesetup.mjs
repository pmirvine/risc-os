// !Letters' Page setup box (Batch D P4.3, D21) in the real desktop:
// Format > Page setup... opens the box with the caret section's
// values (Letter, portrait, 1" margins, Apply to This section in a
// document of two sections); picking A4 from the Paper popup puts
// its size in, OK applies it (the first page drawn narrower in Print
// layout, one undo step, the box gone); Escape cancels (nothing
// changed); margins that leave no text width beep, say why and keep
// the box; a box left open while the caret moves to another section
// beeps on OK and shows that section's values; Landscape swaps the
// width and height shown; the box is deleted with its document.
// The Layout box (P4.4, D21): Format > Layout... opens with the caret
// section's values (New page, Top, header and footer 0.5", the Line
// numbers... button live since P11.2); Odd page, Bottom and a header 0.3" from
// the edge go in on OK (type oddPage, vAlign bottom, 432 twips, one
// undo step) and read back when it opens again; Different odd and
// even and Different first page are one more step (settings.xml
// evenAndOddHeaders, the section's titlePg); a header 30" from the
// edge beeps and keeps the box. Insert > Section break > Odd page
// from page 1 puts the next text on page 3, page 2 a blank page not
// shown (PG3). Review P4 M4: the Cancel button closes the box with
// no change; This point forward with the caret mid-paragraph splits
// it into 3 sections in one step (Ctrl+Z gives 2 back); two documents
// have a box each and closing one deletes only its own; a stale
// Layout box beeps on OK, is refilled and kept. No page errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, settingsXml, p, r } from './build-docx.mjs';

const MAR = (left) => `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="${left}" w:header="720" w:footer="720" w:gutter="0"/>`;
const SZ = '<w:pgSz w:w="12240" w:h="15840"/>';
const BODY = p(r('Section one, first paragraph.')) + p(r('End of section one.'), `<w:sectPr>${SZ}${MAR(1440)}</w:sectPr>`)
  + p(r('Section two.')) + `<w:sectPr><w:type w:val="nextPage"/>${SZ}${MAR(1800)}</w:sectPr>`;
// one section of each paper (review P5 I1), the last A4 landscape
const PAPER_SZ = [[11906, 16838], [8391, 11906], [16838, 23811], [10319, 14571], [12240, 15840]];
const PAPERS = PAPER_SZ.map(([w, h], i) => p(r('Paper ' + i + '.'), `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"/>${MAR(1440)}</w:sectPr>`)).join('')
  + p(r('A4 landscape.')) + `<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>${MAR(1440)}</w:sectPr>`;
const files = { Papers: Array.from(await buildDocx({ 'word/document.xml': documentXml(PAPERS) })), Pg: Array.from(await buildDocx({ 'word/document.xml': documentXml(BODY), 'word/settings.xml': settingsXml('<w:defaultTabStop w:val="720"/>') })),
  Pg2: Array.from(await buildDocx({ 'word/document.xml': documentXml(BODY) })) };

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const { browser, page, logs } = await launch({ height: 1000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); await settle(); };
const click = async (q) => { await page.mouse.click(q.x, q.y); await wait(60); await settle(); };
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
    window.__leaf = 'Pg';
    window.__doc = () => window.__word()?.word.docs.find((d) => d.leaf === window.__leaf);
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    /** The open Page setup box of the document, or null. */
    window.__boxName = 'page';
    window.__box = () => {
      const d = window.__doc(), n = window.__boxName;
      return d && d.dw.boxes.has(n) ? window.__word().word.dialog({ key: n + ':' + d.docKey, rows: [] }) : null;
    };
    window.__icon = (name) => {
      const w = window.__box().win, b = w.iconByName(name).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    /** Format > Page setup... chosen (as a click on it does). */
    window.__menu = (path = ['Format', 'Page setup...']) => {
      const d = window.__doc();
      let m = d.win.menu({});
      for (const t of path.slice(0, -1)) m = m.items.find((i) => i.text === t).submenu();
      const it = m.items.find((i) => i.text === path[path.length - 1]);
      if (typeof it.shaded === 'function' ? it.shaded(it) : it.shaded) return false;
      it.action(it);
      return true;
    };
    /** The first page's width on the screen (px) and the state. */
    window.__state = () => {
      const d = window.__doc(), Pl = d.view.layout.place;
      const w = Pl.pages ? Pl.sheet.rect(Pl.pages.at(0)).w : null;
      return { w, depth: d.view.undoDepth, beeps: window.__beeps, box: !!window.__box() && window.__box().isOpen,
        msg: window.__box() ? window.__box().get('msg') : null, sects: d.d.doc.sections.length };
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
    await window.__word().word.open('RAM::RamDisc0.$.Pg');
    await window.__frames(3);
    window.__doc().win.open({ x: 40, y: 40, w: 900, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
  }, files);
  const field = async (name, text) => {
    await click(await ev((n) => window.__icon(n), name));
    await press('End');
    await press('Backspace', 12);
    if (text) { await page.keyboard.type(text); await settle(); }
  };
  const pickMenu = async (text) => {
    const item = page.locator('.menu').last().locator('.mitem', { hasText: text }).first();
    const b = await item.boundingBox();
    await page.mouse.click(b.x + 30, b.y + b.height / 2);
    await wait(150);
    await settle();
  };
  const open = async (path) => { const m = await ev((x) => window.__menu(x), path); await wait(100); await settle(); return m; };

  // ------------------------------------------------ the box opens with the section's values
  const s0 = await ev(() => window.__state());
  ok('the document opens in Print layout, first page 816 px wide (Letter)', s0.w === 816 && s0.sects === 2, s0);
  ok('Format > Page setup... is there and not shaded', await open());
  const v1 = await ev(() => { const b = window.__box(); return b && { open: b.isOpen, title: b.win.title, v: b.values() }; });
  ok('it opens the Page setup box with the caret section\'s values', v1 && v1.open && v1.title === 'Page setup'
    && v1.v.paper === 'letter' && v1.v.w === 12240 && v1.v.h === 15840 && v1.v.orient === 'portrait'
    && v1.v.top === 1440 && v1.v.left === 1440 && v1.v.gutter === 0 && v1.v.gpos === 'left'
    && v1.v.scope === 'section' && v1.v.msg === '', v1);
  const minW = await ev(() => window.__box().win.w);
  ok('... at least 3.8 inches (684 px) wide', minW >= 684, minW);

  // ------------------------------------------------ Escape cancels
  await field('left', '2');
  await press('Escape');
  const e1 = await ev(() => window.__state());
  ok('Escape: the box goes, nothing changed', !e1.box && e1.depth === s0.depth && e1.w === 816, e1);

  // ------------------------------------------------ A4 + OK applies
  await open();
  await click(await ev(() => window.__icon('arrow:paper')));
  await wait(150);
  await pickMenu('A4');
  const v2 = await ev(() => window.__box().values());
  ok('picking A4 puts its width and height in (8.27" x 11.69": the exact twips go to the document)', v2.paper === 'a4' && Math.abs(v2.w - 11906) < 8 && Math.abs(v2.h - 16838) < 8, v2);
  await click(await ev(() => window.__icon('button:OK')));
  await ev(() => window.__frames(4));
  const o2 = await ev(() => ({ ...window.__state(), pg: window.__doc().d.doc.sections.map((s) => s.props.pgSz) }));
  ok('OK: section 1 is A4 (section 2 still Letter), one undo step, the box gone', !o2.box && o2.depth === s0.depth + 1
    && o2.pg[0].w === 11906 && o2.pg[0].h === 16838 && o2.pg[1].w === 12240, o2);
  ok('... the first page is drawn narrower (794 px)', o2.w === 794, o2);

  // ------------------------------------------------ refused values beep and keep the box
  await open();
  await field('left', '6');
  await field('right', '6');
  const b3 = (await ev(() => window.__state())).beeps;
  await click(await ev(() => window.__icon('button:OK')));
  const o3 = await ev(() => window.__state());
  ok('margins of 6" each on A4: OK beeps, says why, keeps the box, changes nothing', o3.box && o3.beeps === b3 + 1
    && /0\.1 inch/.test(o3.msg) && o3.depth === o2.depth && o3.w === 794, o3);

  // ------------------------------------------------ a stale box is filled again
  await ev(() => { const d = window.__doc(), b = d.d.doc.sections[1].blocks[0]; d.view.setSelection({ id: b.id, off: 0 }); });
  await settle();
  await click(await ev(() => window.__icon('button:OK')));
  const o4 = await ev(() => ({ ...window.__state(), v: window.__box()?.values() }));
  ok('the caret moved to section 2 while the box was open: OK beeps, keeps the box and shows section 2 (Letter, left 1.25")',
    o4.box && o4.beeps === o3.beeps + 1 && o4.depth === o3.depth && o4.v.left === 1800 && o4.v.w === 12240
    && o4.v.paper === 'letter', o4);
  await click(await ev(() => window.__icon('landscape')));
  const v5 = await ev(() => window.__box().values());
  ok('Landscape swaps the width and height shown', v5.orient === 'landscape' && v5.w === 15840 && v5.h === 12240, v5);
  await press('Enter');
  const o5 = await ev(() => ({ ...window.__state(), pg: window.__doc().d.doc.sections[1].props.pgSz }));
  ok('Return (OK): section 2 landscape, one more step', !o5.box && o5.depth === o4.depth + 1
    && o5.pg.w === 15840 && o5.pg.orient === 'landscape', o5);
  await press('Control+z');
  await press('Control+z');
  const u = await ev(() => ({ ...window.__state(), pg: window.__doc().d.doc.sections.map((s) => s.props.pgSz) }));
  ok('two undos give back both Letter sections', u.pg[0].w === 12240 && u.pg[1].w === 12240 && !u.pg[1].orient && u.w === 816, u);

  // ------------------------------------------------ the Layout box (P4.4)
  const LAY = ['Format', 'Layout...'];
  const sect2 = () => ev(() => { const d = window.__doc(), x = d.d.doc.sections[1].props;
    return { type: x.type, vAlign: x.vAlign, titlePg: x.titlePg, header: x.pgMar?.header,
      eo: JSON.stringify(d.d.doc.rawSettings).includes('evenAndOddHeaders'), ...window.__state() }; });
  await ev(() => { window.__boxName = 'layout'; });
  const l0 = await sect2();
  ok('Format > Layout... is there and not shaded', await open(LAY));
  const lv = await ev(() => { const b = window.__box(); return b && { open: b.isOpen, title: b.win.title, w: b.win.w, v: b.values(),
    ln: b.win.iconByName('linenums').shaded }; });
  ok('it opens the Layout box with the caret section\'s values (section 2: New page, header and footer 0.5", Top)',
    lv && lv.open && lv.title === 'Layout' && lv.v.start === 'nextPage' && lv.v.evenodd === false && lv.v.titlepg === false
    && lv.v.header === 720 && lv.v.footer === 720 && lv.v.valign === 'top' && lv.v.msg === '', lv);
  ok('... at least 3.6 inches (648 px) wide, Line numbers... not shaded (P11.2)', lv && lv.w >= 648 && lv.ln === false, lv);
  await click(await ev(() => window.__icon('arrow:start')));
  await wait(150);
  await pickMenu('Odd page');
  await click(await ev(() => window.__icon('arrow:valign')));
  await wait(150);
  await pickMenu('Bottom');
  await field('header', '0.3');
  await click(await ev(() => window.__icon('button:OK')));
  const l1 = await sect2();
  ok('OK: section 2 starts on an odd page, bottom aligned, its header 0.3" (432 twips) from the edge; one undo step',
    !l1.box && l1.type === 'oddPage' && l1.vAlign === 'bottom' && l1.header === 432 && l1.depth === l0.depth + 1, l1);
  await open(LAY);
  const lv2 = await ev(() => window.__box().values());
  ok('it opens again with those values', lv2.start === 'oddPage' && lv2.valign === 'bottom' && lv2.header === 432, lv2);
  await click(await ev(() => window.__icon('evenodd')));
  await click(await ev(() => window.__icon('titlepg')));
  await press('Enter');
  const l2 = await sect2();
  ok('Different odd and even + Different first page: settings and titlePg, one more step', !l2.box && l2.eo
    && l2.titlePg === true && l2.depth === l1.depth + 1, l2);
  await open(LAY);
  const lv3 = await ev(() => window.__box().values());
  ok('... and read back', lv3.evenodd === true && lv3.titlepg === true, lv3);
  await field('header', '30');
  await click(await ev(() => window.__icon('button:OK')));
  const l3 = await sect2();
  ok('a header 30" from the edge: OK beeps, says why, keeps the box', l3.box && l3.beeps === l2.beeps + 1
    && /Header/.test(l3.msg) && l3.depth === l2.depth, l3);
  await press('Escape');
  await press('Control+z');
  await press('Control+z');
  const l4 = await sect2();
  ok('Escape changes nothing; two undos give section 2 back', !l4.box && l4.type === 'nextPage' && !l4.vAlign
    && l4.header === 720 && !l4.eo && !l4.titlePg && l4.depth === l0.depth, l4);
  await ev(() => { window.__boxName = 'page'; });

  // ------------------------------------------------ Insert > Section break > Odd page (PG3)
  await ev(() => { const d = window.__doc(), b = d.d.doc.sections[0].blocks[1]; d.view.setSelection({ id: b.id, off: 0 }); });
  await settle();
  ok('Insert > Section break > Odd page is there', await open(['Insert', 'Section break', 'Odd page']));
  await ev(() => window.__frames(4));
  const pg3 = await ev(() => {
    const d = window.__doc(), P = d.view.layout.place.pages, doc = d.d.doc;
    const b = doc.sections[1].blocks[0], i = P.ofPos({ id: b.id, off: 0 });
    // (the caret at the start of a paragraph: an empty one before it ends section 1)
    const pg = (k) => { const x = P.at(k); return x && { num: x.num, blank: x.blank, top: x.top, h: x.h }; };
    return { i, text: b.text, type: doc.sections[1].props.type, shown: P.num(i), at: [0, 1, 2, 3].map(pg), depth: d.view.undoDepth };
  });
  const [p1, p2, p3] = pg3.at;
  ok('from page 1: the next text ("End of section one.") is on page 3; page 2 is blank and not shown',
    pg3.type === 'oddPage' && pg3.text === 'End of section one.' && pg3.i === 2 && pg3.shown === '3'
    && p2.blank && p2.num === 2 && p3.num === 3 && p3.top === p2.top && p3.top === p1.top + p1.h + 16, pg3);
  await press('Control+z');

  // ------------------------------------------------ review P4 M4: Cancel, This point forward, two documents, stale Layout
  const st = () => ev(() => window.__state());
  const left0 = () => ev(() => window.__doc().d.doc.sections[0].props.pgMar.left);
  const c0 = { ...(await st()), left: await left0() };
  await open();
  await field('left', '1.5');
  await click(await ev(() => window.__icon('button:Cancel')));
  const c1x = { ...(await st()), left: await left0() };
  ok('the Cancel button: the box goes, nothing changed, no step', !c1x.box && c1x.depth === c0.depth && c1x.left === 1440, c1x);

  await ev(() => { const d = window.__doc(), b = d.d.doc.sections[0].blocks[0]; d.view.setSelection({ id: b.id, off: 8 }); });
  await settle();
  await open();
  await ev(() => window.__box().set('scope', 'forward'));
  await settle();
  await field('left', '2');
  await click(await ev(() => window.__icon('button:OK')));
  const f1 = await ev(() => { const d = window.__doc(); return { ...window.__state(),
    lefts: d.d.doc.sections.map((s) => s.props.pgMar && s.props.pgMar.left),
    texts: d.d.doc.sections.map((s) => s.blocks.map((b) => b.text)) }; });
  ok('This point forward with the caret mid-paragraph: the paragraph splits, 3 sections, left 2" from the caret on, one step',
    !f1.box && f1.sects === 3 && f1.depth === c1x.depth + 1 && f1.lefts[0] === 1440 && f1.lefts[1] === 2880
    && f1.lefts[2] === 2880 && f1.texts[0][0] === 'Section ' && f1.texts[1][0] === 'one, first paragraph.', f1);
  await press('Control+z');
  const f2 = await ev(() => { const d = window.__doc(); return { ...window.__state(),
    texts: d.d.doc.sections.map((s) => s.blocks.map((b) => b.text)) }; });
  ok('... Ctrl+Z: 2 sections and the text back', f2.sects === 2 && f2.depth === c1x.depth
    && f2.texts[0][0] === 'Section one, first paragraph.', f2);

  const two = await ev(async () => {
    const w = window.__word().word;
    await w.open('RAM::RamDisc0.$.Pg2');
    await window.__frames(3);
    const d1 = window.__doc(), d2 = w.docs.find((d) => d.leaf === 'Pg2');
    for (const d of [d1, d2]) {
      const it = d.win.menu({}).items.find((i) => i.text === 'Format').submenu().items.find((i) => i.text === 'Page setup...');
      it.action(it);
    }
    await window.__frames(3);
    const b1 = w.dialog({ key: 'page:' + d1.docKey, rows: [] }), b2 = w.dialog({ key: 'page:' + d2.docKey, rows: [] });
    const r = { distinct: b1 !== b2 && b1.win !== b2.win, open: [b1.isOpen, b2.isOpen] };
    d2.dw.close();
    await window.__frames(3);
    r.after = { b1: b1.isOpen, b2: b2.isOpen, docs: w.docs.length };
    return r;
  });
  ok('two documents: a Page setup box each; closing one deletes only its own', two.distinct && two.open[0] && two.open[1]
    && two.after.b1 && !two.after.b2 && two.after.docs === 1, two);
  await click(await ev(() => window.__icon('button:Cancel')));

  await ev(() => { const d = window.__doc(), b = d.d.doc.sections[0].blocks[0]; d.view.setSelection({ id: b.id, off: 0 }); });
  await settle();
  await ev(() => { window.__boxName = 'layout'; });
  await open(LAY);
  const sl0 = await ev(() => window.__box().values());
  await ev(() => { const d = window.__doc(), b = d.d.doc.sections[1].blocks[0]; d.view.setSelection({ id: b.id, off: 0 }); });
  await settle();
  const sl1 = await st();
  await click(await ev(() => window.__icon('button:OK')));
  const sl2 = { ...(await st()), v: await ev(() => window.__box()?.values()) };
  ok('a stale Layout box (the caret moved to section 2): OK beeps, keeps the box, refilled with section 2\'s values, no step',
    sl0.header === 720 && sl2.box && sl2.beeps === sl1.beeps + 1 && sl2.depth === sl1.depth && sl2.v.start === 'nextPage', sl2);
  await click(await ev(() => window.__icon('button:Cancel')));
  await ev(() => { window.__boxName = 'page'; });

  // ------------------------------------------------ deleted with the document
  await open();
  await open(LAY);
  const pw = () => ev(() => [...os.wimp.windows.values()].filter((w) => w.title === 'Page setup' || w.title === 'Layout').length);
  const n0 = await pw();
  await ev(() => window.__doc().dw.close());
  await ev(() => window.__frames(3));
  const c1 = { before: n0, after: await pw(), docs: await ev(() => window.__word().word.docs.length) };
  ok('the boxes go with their document (closed: no changes after the undos)', c1.before === 2 && c1.after === 0 && c1.docs === 0, c1);

  // ------------------------------------------------ review P5 I1: every paper opens on its own paper
  await ev(async () => {
    await window.__word().word.open('RAM::RamDisc0.$.Papers');
    window.__leaf = 'Papers';
    await window.__frames(3);
    window.__doc().win.open({ x: 40, y: 40, w: 900, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
  });
  const seen = [];
  for (let s = 0; s < 6; s++) {
    await ev((s) => { const d = window.__doc(), b = d.d.doc.sections[s].blocks[0]; d.view.setSelection({ id: b.id, off: 0 }); }, s);
    await settle();
    await open();
    seen.push(await ev(() => { const v = window.__box().values(); return [v.paper, v.w, v.h, v.orient]; }));
    if (s < 5) await click(await ev(() => window.__icon('button:Cancel')));
  }
  ok('A4, A5, A3, B5 (JIS), Letter and A4 landscape sections open the box on their own paper',
    seen.map((x) => x[0]).join() === 'a4,a5,a3,b5jis,letter,a4' && seen[5][3] === 'landscape', seen);
  // typing a paper's size (as the box shows it, to 1/100 inch) shows that paper
  const typed = [];
  for (const [w, h] of [['8.27', '11.69'], ['11.69', '16.54'], ['5.83', '8.27'], ['7.17', '10.12'], ['8.5', '11'], ['8.3', '11.69']]) {
    await field('w', w);
    await field('h', h);
    typed.push(await ev(() => window.__box().get('paper')));
  }
  ok('typing a size shows its paper (A4, A3, A5, B5 (JIS), Letter), or Custom', typed.join() === 'a4,a3,a5,b5jis,letter,custom', typed);
  const before = await ev(() => JSON.stringify(window.__doc().d.doc.sections.map((s) => s.props.pgSz)));
  await click(await ev(() => window.__icon('button:Cancel')));
  await ev(async () => {
    const u = await window.__word().word.new({ paper: 'a4' });
    await window.__frames(3);
    window.__leaf = u.leaf;
    const it = window.__doc().win.menu({}).items.find((i) => i.text === 'Format').submenu().items.find((i) => i.text === 'Page setup...');
    it.action(it);
    await window.__frames(3);
  });
  const nv = await ev(() => { const v = window.__box().values(); return [v.paper, v.w, v.h]; });
  ok('a new !Letters document opens the box on Paper A4', nv[0] === 'a4', nv);
  await click(await ev(() => window.__icon('button:Cancel')));
  ok('... nothing changed by looking', before === await ev(() => JSON.stringify(window.__word().word.docs.find((d) => d.leaf === 'Papers').d.doc.sections.map((s) => s.props.pgSz))), before);

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
