// !Letters' Styles window in the real desktop (./StylesWin): Format >
// Styles... opens it (shaded without a selection), it lists the
// gallery in Word's names (Normal, Heading 1), All styles lists more,
// a double-click applies the style to the selected paragraph (one
// undo step), Delete of a used style asks (Cancel keeps it, Delete
// clears the paragraphs), undo brings them back and the open window
// refreshes, a style nobody uses goes without asking, Delete is
// shaded for built-ins, and the window closes with its document. Task 8:
// New... / Modify... / Rename open ./StyleBox: Modify Heading 1's size
// (the document lays out again, undo reverts), Cancel changes nothing,
// a duplicate name keeps the box with the reason, New makes a style
// the window selects and applies, Rename (a built-in refused), a
// latent built-in is added by its first Modify. Task 9: the Modify
// Style box's Tabs..., Borders... and Numbering... work on the style
// (./StyleTarget): kept until the style box's OK (one undo step, the
// paragraph shows the stop, a new list), dropped by its Cancel (the
// Tabs box closed with it), stale when the styles change.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, stylesXml, p, r } from './build-docx.mjs';

const BASE = '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
  + '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>'
  + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>'
  + '<w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>'
  + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Memo"><w:name w:val="Memo"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="5"/><w:qFormat/><w:rPr><w:i/></w:rPr></w:style>'
  + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Spare"><w:name w:val="Spare"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="6"/><w:qFormat/></w:style>'
  + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Plain2"><w:name w:val="Plain two"/><w:basedOn w:val="Normal"/></w:style>';
const sty = (id) => `<w:pPr><w:pStyle w:val="${id}"/></w:pPr>`;
const file = Array.from(await buildDocx({
  'word/document.xml': documentXml([
    p(r('Make me a heading.')), p(r('Plain body.')),
    p(r('Memo one'), '<w:pStyle w:val="Memo"/>'), p(r('Memo two'), '<w:pStyle w:val="Memo"/>'),
  ].join('')),
  'word/styles.xml': stylesXml(BASE),
}));

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(3));

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  const s0 = await ev(async (file) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    os.vfs.writeFile('RAM::RamDisc0.$.Sty', new Uint8Array(file), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = () => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === 'Sty');
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__sw = () => window.__doc()?.dw.boxes.get('styles') ?? null;
    window.__row = (id) => {
      const w = window.__sw();
      let r = w?.api.where(id);
      if (!r && w?.api.select(id)) r = w.api.where(id);   // (scrolled into view)
      return r ? window.__client(w, r.x + 20, r.y + r.h / 2) : null;
    };
    window.__btn = (n) => {
      const w = window.__sw(), b = w.iconByName('button:' + n).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    window.__shaded = (n) => window.__sw().iconByName('button:' + n).shaded;
    window.__ps = () => window.__doc().doc.sections[0].blocks.map((b) => b.pStyle ?? null);
    window.__sel = (i, a, j, b) => {
      const d = window.__doc(), L = d.view.layout;
      d.view.setSelection({ id: L.items[i].id, off: a }, { id: L.items[j].id, off: b });
    };
    // the Wimp's query box: icon 0 the first button, 1 the message, 2 the second
    window.__prompt = () => [...os.wimp.windows.values()].find((w) => w.isOpen && w !== window.__sw() && w.icons?.[0]?.text === 'Delete'
      && w.icons?.[2]?.text === 'Cancel') ?? null;
    window.__pbtn = (n) => {
      const w = window.__prompt(), b = w.icons[n === 'Delete' ? 0 : 2].bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await os.filer.run('RAM::RamDisc0.$.Sty');
    for (let i = 0; i < 200 && !window.__doc(); i++) await window.__sleep(50);
    window.__doc().win.open({ x: 40, y: 40, w: 640, h: 330, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    return { ok: !!window.__doc(), msgs: window.__msgs };
  }, file);
  ok('the document opens', s0.ok && !s0.msgs.length, s0);
  const base = await ev(() => os.wimp.windows.size);
  const click = async (c, n = 1) => { await wait(450); await page.mouse.click(c.x, c.y, { clickCount: n }); await wait(60); await settle(); };
  const state = () => ev(() => {
    const a = window.__sw()?.api;
    return a && { open: a.isOpen, ids: a.entries.map((e) => e.id), names: a.entries.map((e) => e.name), sel: a.selected, filter: a.filter };
  });
  const fmt = (leaf) => ev((leaf) => {
    const it = window.__doc().win.menu({}).items.find((i) => i.text === 'Format').submenu().items.find((i) => i.text === leaf);
    return { shaded: typeof it.shaded === 'function' ? !!it.shaded() : !!it.shaded, run: !!it.action };
  }, leaf);

  // ------------------------------------------------ opening
  await ev(() => { window.__doc().view.setSelection({ id: window.__doc().view.layout.items[0].id, off: 0 }); });
  const menuIt = await fmt('Styles...');
  ok('Format > Styles... is live with a caret', menuIt.run && !menuIt.shaded, menuIt);
  await ev(() => window.__doc().win.menu({}).items.find((i) => i.text === 'Format').submenu().items.find((i) => i.text === 'Styles...').action());
  await settle();
  const s1 = await state();
  ok('it opens a Styles window listing the gallery by Word\'s names', s1?.open && s1.names.includes('Normal') && s1.names.includes('Heading 1')
    && s1.names.includes('Memo') && s1.ids.includes('Heading1') && !s1.ids.includes('Plain2') && s1.filter === 'gallery', s1);
  const t1 = await ev(() => window.__sw().title);
  ok('... titled Styles', t1 === 'Styles', t1);
  ok('... one window more', (await ev(() => os.wimp.windows.size)) === base + 1, null);
  await ev(() => window.__doc().win.menu({}).items.find((i) => i.text === 'Format').submenu().items.find((i) => i.text === 'Styles...').action());
  await settle();
  ok('asking again keeps one window', (await ev(() => os.wimp.windows.size)) === base + 1, null);

  const sh0 = await ev(() => ['Apply', 'New...', 'Modify...', 'Rename', 'Delete', 'Close'].map((n) => [n, window.__shaded(n)]));
  ok('nothing chosen: Apply, Modify, Rename, Delete shaded; New... and Close live',
    JSON.stringify(sh0) === JSON.stringify([['Apply', true], ['New...', false], ['Modify...', true], ['Rename', true], ['Delete', true], ['Close', false]]), sh0);

  // ------------------------------------------------ All styles
  await ev(() => window.__sw().api.setFilter('all'));
  await settle();
  const sAll = await state();
  ok('All styles lists the styles the gallery leaves out', sAll.filter === 'all' && sAll.ids.includes('Plain2') && sAll.ids.includes('Memo'), sAll);
  await ev(() => window.__sw().api.setFilter('gallery'));
  await settle();

  // ------------------------------------------------ choose, shading
  await click(await ev(() => window.__row('Normal')));
  const sh1 = await ev(() => ({ sel: window.__sw().api.selected, del: window.__shaded('Delete'), apply: window.__shaded('Apply'), mod: window.__shaded('Modify...'), ren: window.__shaded('Rename'), nw: window.__shaded('New...') }));
  ok('a click chooses Normal: Apply, New, Modify, Rename live; Delete shaded (a built-in)',
    sh1.sel === 'Normal' && !sh1.apply && sh1.del && !sh1.mod && !sh1.ren && !sh1.nw, sh1);

  // ------------------------------------------------ double-click applies
  const depth0 = await ev(() => window.__doc().view.undoDepth);
  await click(await ev(() => window.__row('Heading1')), 2);
  const ps1 = await ev(() => window.__ps());
  ok('a double-click on Heading 1 applies it to paragraph 1', ps1[0] === 'Heading1' && ps1[1] === null, ps1);
  const depth1 = await ev(() => window.__doc().view.undoDepth);
  ok('... one undo step', depth1 === depth0 + 1, [depth0, depth1]);

  // ------------------------------------------------ Delete a used style
  await click(await ev(() => window.__row('Memo')));
  const sh2 = await ev(() => window.__shaded('Delete'));
  ok('choosing Memo (made by the user) live Delete', sh2 === false, sh2);
  await click(await ev(() => window.__btn('Delete')));
  const pr = await ev(() => { const w = window.__prompt(); return w && { title: w.title, text: w.icons[1].text }; });
  ok('Delete of a used style asks for confirmation (2 paragraphs)', pr && /Memo/.test(pr.text) && /2 paragraphs/.test(pr.text), pr);
  ok('... nothing changed yet', JSON.stringify(await ev(() => window.__ps())) === JSON.stringify(['Heading1', null, 'Memo', 'Memo']), null);
  await click(await ev(() => window.__pbtn('Cancel')));
  ok('Cancel keeps the style and the paragraphs', JSON.stringify(await ev(() => window.__ps())) === JSON.stringify(['Heading1', null, 'Memo', 'Memo'])
    && (await state()).ids.includes('Memo') && !(await ev(() => window.__prompt())), await ev(() => window.__ps()));
  const d2 = await ev(() => window.__doc().view.undoDepth);
  await click(await ev(() => window.__btn('Delete')));
  await click(await ev(() => window.__pbtn('Delete')));
  const ps2 = await ev(() => window.__ps());
  const s2 = await state();
  ok('Delete then confirming clears both paragraphs and removes the style from the list', JSON.stringify(ps2) === JSON.stringify(['Heading1', null, null, null])
    && !s2.ids.includes('Memo') && s2.sel === null, { ps2, s2 });
  ok('... one undo step', (await ev(() => window.__doc().view.undoDepth)) === d2 + 1, d2);
  ok('... the style is gone from the document', await ev(() => !window.__doc().doc.styles.styles.has('Memo')), null);

  // ------------------------------------------------ undo refreshes
  await ev(() => window.__doc().dw.view.undo());
  await wait(100);
  await settle();
  const ps3 = await ev(() => window.__ps());
  const s3 = await state();
  ok('undo restores the paragraphs\' style', JSON.stringify(ps3) === JSON.stringify(['Heading1', null, 'Memo', 'Memo']), ps3);
  ok('... and the open window lists Memo again', s3.ids.includes('Memo'), s3);
  await ev(() => window.__doc().dw.view.redo());
  await wait(100);
  await settle();
  ok('redo refreshes it too (Memo gone)', !(await state()).ids.includes('Memo'), await state());
  await ev(() => window.__doc().dw.view.undo());
  await wait(100);
  await settle();

  // ------------------------------------------------ an unused style needs no question
  await click(await ev(() => window.__row('Spare')));
  await click(await ev(() => window.__btn('Delete')));
  const s4 = await state();
  ok('deleting a style nobody uses asks nothing and removes it', !(await ev(() => window.__prompt())) && !s4.ids.includes('Spare')
    && JSON.stringify(await ev(() => window.__ps())) === JSON.stringify(['Heading1', null, 'Memo', 'Memo']), s4);

  // ------------------------------------------------ Task 8: the style box
  await ev(() => {
    window.__bx = (m) => window.__doc().dw.boxes.get('style-' + m) ?? null;
    window.__bbtn = (m, n) => {
      const w = window.__bx(m), b = w.iconByName('button:' + n).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    window.__txt = (m, n) => window.__bx(m).iconByName(n).text;
    window.__put = (m, n, t) => { window.__bx(m).iconByName(n).setText(t); };
    window.__tbl = () => window.__doc().doc.styles;
    window.__top = () => window.__doc().view.layout.items.slice(0, 3).map((i) => Math.round(i.y ?? i.top ?? 0) + ':' + Math.round(i.h ?? i.height ?? 0));
  });
  const boxOpen = (m) => ev((m) => !!window.__bx(m)?.isOpen, m);
  const depth = () => ev(() => window.__doc().view.undoDepth);

  await ev(() => window.__sw().api.select('Heading1'));
  await settle();
  const lay0 = await ev(() => window.__top());
  const dA = await depth();
  await click(await ev(() => window.__btn('Modify...')));
  const m1 = await ev(() => { const w = window.__bx('modify'); return w && { open: w.isOpen, title: w.title, name: window.__txt('modify', 'name'), size: window.__txt('modify', 'size'), font: window.__txt('modify', 'font') }; });
  ok('Modify... opens the Modify Style box filled from Heading 1 (name, size 16)', m1?.open && m1.title === 'Modify Style' && m1.name === 'Heading 1' && /^16/.test(m1.size), m1);
  await ev(() => window.__put('modify', 'size', '24'));
  await click(await ev(() => window.__bbtn('modify', 'OK')));
  await wait(150);
  await settle();
  const h1 = await ev(() => window.__tbl().styles.get('Heading1'));
  ok('OK writes the size into Heading 1 (sz 48), keeping its bold', h1.rPr.sz === 48 && h1.rPr.b === true && h1.pPr.keepNext === true, h1.rPr);
  ok('... the box is gone, one undo step', !(await boxOpen('modify')) && (await depth()) === dA + 1, [await depth(), dA]);
  const lay1 = await ev(() => window.__top());
  ok('... the document lays out again (the heading is taller)', JSON.stringify(lay0) !== JSON.stringify(lay1), [lay0, lay1]);
  await ev(() => window.__doc().dw.view.undo());
  await wait(100);
  await settle();
  const h1u = await ev(() => window.__tbl().styles.get('Heading1').rPr.sz);
  ok('undo puts the size back (32) and the layout', h1u === 32 && JSON.stringify(await ev(() => window.__top())) === JSON.stringify(lay0), [h1u, await ev(() => window.__top())]);

  // Cancel changes nothing
  const dB = await depth();
  await click(await ev(() => window.__btn('Modify...')));
  await ev(() => window.__put('modify', 'size', '30'));
  await click(await ev(() => window.__bbtn('modify', 'Cancel')));
  ok('Cancel changes nothing and closes the box', !(await boxOpen('modify')) && (await depth()) === dB
    && (await ev(() => window.__tbl().styles.get('Heading1').rPr.sz)) === 32 && (await ev(() => os.wimp.caret?.window === window.__doc().win)), await depth());

  // a duplicate name keeps the box with the reason
  await click(await ev(() => window.__row('Memo')));
  await click(await ev(() => window.__btn('Modify...')));
  await ev(() => window.__put('modify', 'name', 'normal'));
  await click(await ev(() => window.__bbtn('modify', 'OK')));
  const dup = await ev(() => ({ open: !!window.__bx('modify')?.isOpen, msg: window.__txt('modify', 'msg') }));
  ok('a duplicate name keeps the box open with the reason; nothing changed', dup.open && /already a style/.test(dup.msg) && (await depth()) === dB
    && (await ev(() => window.__tbl().styles.get('Memo').name)) === 'Memo', dup);
  await ev(() => window.__put('modify', 'name', 'Memo'));
  await ev(() => window.__put('modify', 'size', 'abc'));
  await click(await ev(() => window.__bbtn('modify', 'OK')));
  const badSize = await ev(() => ({ open: !!window.__bx('modify')?.isOpen, msg: window.__txt('modify', 'msg') }));
  ok('a size that is not a number keeps the box with the reason', badSize.open && /Size/.test(badSize.msg) && (await depth()) === dB, badSize);
  await click(await ev(() => window.__bbtn('modify', 'Cancel')));

  // New
  await click(await ev(() => window.__btn('New...')));
  const n1 = await ev(() => { const w = window.__bx('new'); return w && { open: w.isOpen, title: w.title, name: window.__txt('new', 'name') }; });
  ok('New... opens the New Style box, name empty', n1?.open && n1.title === 'New Style' && n1.name === '', n1);
  await click(await ev(() => window.__bbtn('new', 'OK')));
  ok('an empty name is refused, the box kept', (await boxOpen('new')) && /name/i.test(await ev(() => window.__txt('new', 'msg'))), await ev(() => window.__txt('new', 'msg')));
  const dC = await depth();
  await ev(() => { window.__put('new', 'name', 'Fresh'); window.__put('new', 'size', '14'); });
  await click(await ev(() => window.__bbtn('new', 'OK')));
  await wait(150);
  await settle();
  const fr = await ev(() => { const t = window.__tbl(); const s = [...t.styles.values()].find((x) => x.name === 'Fresh'); return s && { id: s.id, type: s.type, based: s.basedOn, sz: s.rPr.sz, custom: s.custom }; });
  ok('OK makes the style (paragraph, based on Normal, size 14), one undo step', fr && fr.type === 'paragraph' && fr.based === 'Normal' && fr.sz === 28 && fr.custom && (await depth()) === dC + 1, fr);
  ok('... the Styles window selects it', (await state()).sel === fr?.id, await state());
  await ev(() => { const d = window.__doc(), L = d.view.layout; d.view.setSelection({ id: L.items[1].id, off: 0 }); });
  await ev(() => window.__sw().api.apply());
  await settle();
  const ps4 = await ev(() => window.__ps());
  ok('applying the new style puts it on the paragraph', ps4[1] === fr.id, ps4);
  await ev(() => window.__doc().dw.view.undo());
  await ev(() => window.__doc().dw.view.undo());
  await wait(100);
  await settle();
  ok('two undos remove the application and the style', !(await ev(() => [...window.__tbl().styles.values()].some((x) => x.name === 'Fresh'))), null);

  // Rename
  await click(await ev(() => window.__row('Memo')));
  await click(await ev(() => window.__btn('Rename')));
  const r1 = await ev(() => { const w = window.__bx('rename'); return w && { open: w.isOpen, title: w.title, name: window.__txt('rename', 'name'), shaded: w.iconByName('size').shaded }; });
  ok('Rename opens the box with only the name live', r1?.open && r1.title === 'Rename Style' && r1.name === 'Memo' && r1.shaded, r1);
  await ev(() => window.__put('rename', 'name', 'Note'));
  await click(await ev(() => window.__bbtn('rename', 'OK')));
  await wait(150);
  await settle();
  const rn = await ev(() => window.__tbl().styles.get('Memo'));
  ok('OK renames it (id kept, other properties untouched)', rn.name === 'Note' && rn.rPr.i === true && !(await boxOpen('rename')), rn.name);
  ok('... the list shows the new name', (await state()).names.includes('Note'), (await state()).names);
  await ev(() => window.__doc().dw.view.undo());
  await wait(100);
  await settle();
  await click(await ev(() => window.__row('Heading1')));
  await click(await ev(() => window.__btn('Rename')));
  await ev(() => window.__put('rename', 'name', 'Big'));
  await click(await ev(() => window.__bbtn('rename', 'OK')));
  const rb = await ev(() => ({ open: !!window.__bx('rename')?.isOpen, msg: window.__txt('rename', 'msg') }));
  ok('renaming a built-in is refused with the reason', rb.open && /built-in/.test(rb.msg), rb);
  await click(await ev(() => window.__bbtn('rename', 'Cancel')));

  // a latent built-in
  const lat = await ev(() => window.__sw().api.entries.find((e) => e.latent)?.id ?? null);
  if (lat) {
    await ev((id) => window.__sw().api.select(id), lat);
    await settle();
    const dD = await depth();
    await click(await ev(() => window.__btn('Modify...')));
    await ev(() => window.__put('modify', 'size', '40'));
    await click(await ev(() => window.__bbtn('modify', 'OK')));
    await wait(150);
    await settle();
    const ls = await ev((id) => window.__tbl().styles.get(id)?.rPr.sz ?? null, lat);
    ok('Modify on a latent built-in (' + lat + ') adds it with the change, one undo step', ls === 80 && (await depth()) === dD + 1, [ls, await depth(), dD]);
    await ev(() => window.__doc().dw.view.undo());
    await wait(100);
    await settle();
    ok('... and undo removes it again', await ev((id) => !window.__tbl().styles.has(id), lat), null);
  } else ok('a latent built-in is listed', false, null);

  // ------------------------------------------------ Task 9: Format... on a style
  await ev(() => {
    window.__kid = (k) => {
      const d = window.__doc();
      return d.dw.boxes.has(k) ? window.__word().word.dialog({ key: k + ':' + d.docKey, rows: [] }) : null;
    };
    window.__kbtn = (k, n) => {
      const w = window.__kid(k).win, b = w.iconByName(n).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    window.__mbtn = (n) => {
      const w = window.__bx('modify'), b = w.iconByName(n).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    window.__h1 = () => window.__tbl().styles.get('Heading1').pPr;
  });
  const kidOpen = (k) => ev((k) => !!window.__kid(k)?.isOpen, k);
  /** The stops a Tabs box (k) lists in its popup. */
  const stopsOf = async (k) => {
    await click(await ev((k) => window.__kbtn(k, 'arrow:stops'), k));
    await wait(150);
    const rows = await ev(() => os.wimp.menus.levels[0]?.rows.map((r) => String(r.item.text)) ?? null);
    await ev(() => os.wimp.menus.close());
    await settle();
    return rows;
  };
  const menuPick = async (level, re, hover) => {
    const item = page.locator('.menu').nth(level).locator('.mitem', { hasText: re }).first();
    const b = await item.boundingBox();
    if (!b) throw new Error(`no menu item ${re} at level ${level}`);
    if (hover) {
      await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 2 });
      await page.mouse.move(b.x + b.width - 6, b.y + b.height / 2, { steps: 3 });
      await wait(250);
    } else {
      await page.mouse.click(b.x + 30, b.y + b.height / 2);
      await wait(150);
    }
    await settle();
  };
  const modifyH1 = async () => {
    await ev(() => window.__sw().api.select('Heading1'));
    await settle();
    await click(await ev(() => window.__btn('Modify...')));
  };
  await ev(() => { const d = window.__doc(), L = d.view.layout; d.view.setSelection({ id: L.items[1].id, off: 0 }); });
  ok('(paragraph 1 is a Heading 1 with no stops; the caret elsewhere)', (await ev(() => window.__ps()))[0] === 'Heading1'
    && (await ev(() => window.__h1().tabs)) === undefined, await ev(() => window.__ps()));

  // Tabs...
  await modifyH1();
  const fb = await ev(() => ['tabs', 'borders', 'numbering'].map((n) => window.__bx('modify').iconByName(n).shaded));
  ok('Modify Heading 1: Tabs..., Borders... and Numbering... live', JSON.stringify(fb) === '[false,false,false]', fb);
  const dT = await depth();
  await click(await ev(() => window.__mbtn('tabs')));
  const tb = await ev(() => { const a = window.__kid('tabs-style'); return a && { open: a.isOpen, title: a.win.title, stops: a.win.iconByName('stops').text, deftab: a.win.iconByName('deftab').shaded }; });
  ok('Tabs... opens a Tabs box on the style (no stops; Default tab stops shaded)', tb?.open && tb.title === 'Tabs' && /none/.test(tb.stops) && tb.deftab, tb);
  ok('... not the document\'s Tabs box', !(await ev(() => window.__doc().dw.boxes.has('tabs'))), null);
  await ev(() => window.__kid('tabs-style').win.iconByName('pos').setText('2'));
  await click(await ev(() => window.__kbtn('tabs-style', 'set')));
  await click(await ev(() => window.__kbtn('tabs-style', 'button:OK')));
  ok('its OK closes it and changes nothing in the document yet', !(await kidOpen('tabs-style')) && (await depth()) === dT
    && (await ev(() => window.__h1().tabs)) === undefined && (await boxOpen('modify')), await ev(() => window.__h1().tabs));
  ok('... the Modify Style box says the change is kept', /Kept/.test(await ev(() => window.__txt('modify', 'msg'))), await ev(() => window.__txt('modify', 'msg')));
  await click(await ev(() => window.__bbtn('modify', 'OK')));
  await wait(150);
  await settle();
  const ht = await ev(() => window.__h1().tabs);
  ok('the style box\'s OK writes the stop into Heading 1 (2" left), one undo step', JSON.stringify(ht) === JSON.stringify([{ val: 'left', pos: 2880 }])
    && (await depth()) === dT + 1 && !(await boxOpen('modify')), [ht, await depth(), dT]);
  // the document's own Tabs box on the Heading 1 paragraph shows it
  await ev(() => { const d = window.__doc(), L = d.view.layout; d.view.setSelection({ id: L.items[0].id, off: 0 }); });
  await ev(() => window.__doc().win.menu({}).items.find((i) => i.text === 'Format').submenu().items.find((i) => i.text === 'Tabs...').action());
  await settle();
  const ds = await stopsOf('tabs');
  ok('... a Heading 1 paragraph has the stop (Format > Tabs... lists 2" Left)', JSON.stringify(ds) === JSON.stringify(['2" Left']), ds);
  await click(await ev(() => window.__kbtn('tabs', 'button:Cancel')));
  await ev(() => window.__doc().dw.view.undo());
  await wait(100);
  await settle();
  ok('one undo takes the stop away', (await ev(() => window.__h1().tabs)) === undefined && (await depth()) === dT, await ev(() => window.__h1().tabs));

  // Cancel on the style box discards the tab (and closes the Tabs box)
  await modifyH1();
  await click(await ev(() => window.__mbtn('tabs')));
  await ev(() => window.__kid('tabs-style').win.iconByName('pos').setText('3'));
  await click(await ev(() => window.__kbtn('tabs-style', 'button:OK')));
  await click(await ev(() => window.__mbtn('tabs')));
  const kept = await stopsOf('tabs-style');
  ok('(Tabs... again shows the stop kept: 3")', JSON.stringify(kept) === JSON.stringify(['3" Left']), kept);
  await click(await ev(() => window.__bbtn('modify', 'Cancel')));
  ok('Cancel on the style box drops it: no stop, no undo step, the Tabs box closed with it',
    (await ev(() => window.__h1().tabs)) === undefined && (await depth()) === dT && !(await kidOpen('tabs-style')) && !(await boxOpen('modify')), await depth());

  // Borders...
  await modifyH1();
  await click(await ev(() => window.__mbtn('borders')));
  const bb = await ev(() => { const a = window.__kid('borders-style'); return a && { open: a.isOpen, text: a.win.iconByName('apply-text').shaded, cell: a.win.iconByName('apply-cell').shaded, apply: a.get('apply'), setting: a.get('setting') }; });
  ok('Borders... opens the Borders box on the style (Paragraph; Text, Cell, Table shaded)', bb?.open && bb.text && bb.cell && bb.apply === 'para' && bb.setting === 'none', bb);
  ok('... not the document\'s', !(await ev(() => window.__doc().dw.boxes.has('borders'))), null);
  await click(await ev(() => window.__kbtn('borders-style', 'setting-box')));
  await click(await ev(() => window.__kbtn('borders-style', 'button:OK')));
  ok('its OK changes nothing yet', !(await kidOpen('borders-style')) && (await ev(() => window.__h1().pBdr)) === undefined && (await depth()) === dT, null);
  await click(await ev(() => window.__bbtn('modify', 'OK')));
  await wait(150);
  await settle();
  const hb = await ev(() => window.__h1().pBdr);
  ok('the style box\'s OK puts a box round Heading 1 (four single sides), one undo step',
    hb && ['top', 'bottom', 'left', 'right'].every((k) => hb[k]?.val === 'single') && !hb.between && (await depth()) === dT + 1, [hb, await depth()]);
  await ev(() => window.__doc().dw.view.undo());
  await wait(100);
  await settle();
  ok('one undo takes it away', (await ev(() => window.__h1().pBdr)) === undefined && (await depth()) === dT, null);

  // Numbering...
  await modifyH1();
  await click(await ev(() => window.__mbtn('numbering')));
  await menuPick(0, /^Bullets/, true);
  await menuPick(1, /Disc/, false);
  ok('Numbering... > Bullets > Disc changes nothing yet', (await ev(() => window.__h1().numPr)) === undefined && (await depth()) === dT
    && /Kept/.test(await ev(() => window.__txt('modify', 'msg'))), await ev(() => window.__h1().numPr));
  const n0 = await ev(() => [...(window.__doc().doc.numbering?.nums?.keys() ?? [])]);
  await click(await ev(() => window.__bbtn('modify', 'OK')));
  await wait(150);
  await settle();
  const hn = await ev(() => ({ numPr: window.__h1().numPr, nums: [...(window.__doc().doc.numbering?.nums?.keys() ?? [])],
    label: window.__doc().view.layout.items[0].label?.text ?? window.__doc().view.layout.items[0].marker?.text ?? null }));
  ok('OK gives Heading 1 a NEW bullet list (numPr names a num the document did not have), one undo step',
    hn.numPr && hn.numPr.ilvl === 0 && !n0.includes(hn.numPr.numId) && hn.nums.includes(hn.numPr.numId) && (await depth()) === dT + 1, [hn, n0]);
  await ev(() => window.__doc().dw.view.undo());
  await wait(100);
  await settle();
  const nu = await ev(() => ({ numPr: window.__h1().numPr, nums: [...(window.__doc().doc.numbering?.nums?.keys() ?? [])] }));
  ok('one undo takes the list and its numbering away', nu.numPr === undefined && JSON.stringify(nu.nums) === JSON.stringify(n0) && (await depth()) === dT, nu);

  // the styles change while the Tabs box is open: its OK fills it again
  await modifyH1();
  await click(await ev(() => window.__mbtn('tabs')));
  await ev(() => window.__kid('tabs-style').win.iconByName('pos').setText('1'));
  await ev(() => { const d = window.__doc().dw.view.d; d.atomic(() => d.apply({ op: 'setDocPart', key: 'styles', value: { ...d.doc.styles } })); });
  await settle();
  const dS = await depth();
  await click(await ev(() => window.__kbtn('tabs-style', 'button:OK')));
  ok('styles changed while the Tabs box was open: its OK keeps it (filled again), nothing kept',
    (await kidOpen('tabs-style')) && !/Kept/.test(await ev(() => window.__txt('modify', 'msg'))) && (await depth()) === dS, null);
  await click(await ev(() => window.__bbtn('modify', 'Cancel')));
  ok('... Cancel on the style box closes both', !(await kidOpen('tabs-style')) && !(await boxOpen('modify')), null);

  // a character style has no Format... buttons
  await ev(() => window.__sw().api.setFilter('all'));
  await settle();
  const chr = await ev(() => window.__sw().api.entries.find((e) => window.__tbl().styles.get(e.id)?.type === 'character')?.id ?? null);
  if (chr) {
    await ev((id) => window.__sw().api.select(id), chr);
    await settle();
    await click(await ev(() => window.__btn('Modify...')));
    const cs = await ev(() => ['tabs', 'borders', 'numbering'].map((n) => window.__bx('modify').iconByName(n).shaded));
    ok('a character style: Tabs..., Borders..., Numbering... shaded', JSON.stringify(cs) === '[true,true,true]', cs);
    await click(await ev(() => window.__bbtn('modify', 'Cancel')));
  }
  await ev(() => window.__sw().api.setFilter('gallery'));
  await settle();
  await click(await ev(() => window.__btn('New...')));
  const ns = await ev(() => ['tabs', 'borders', 'numbering'].map((n) => window.__bx('new').iconByName(n).shaded));
  ok('New Style: Tabs..., Borders..., Numbering... shaded (a style that is not there yet)', JSON.stringify(ns) === '[true,true,true]', ns);
  await click(await ev(() => window.__bbtn('new', 'Cancel')));

  // ------------------------------------------------ Close and key
  await click(await ev(() => window.__btn('Close')));
  ok('Close hides the window and gives the caret to the document', !(await state()).open && (await ev(() => os.wimp.caret?.window === window.__doc().win)), await state());
  await ev(() => window.__doc().win.menu({}).items.find((i) => i.text === 'Format').submenu().items.find((i) => i.text === 'Styles...').action());
  await settle();
  ok('... asking again shows it again (one window)', (await state()).open && (await ev(() => os.wimp.windows.size)) === base + 1, null);

  // ------------------------------------------------ closing the document
  await ev(() => window.__doc().dw.close());
  await settle();
  ok('the window closes with the document', (await ev(() => os.wimp.windows.size)) <= base - 1 && !(await ev(() => !!window.__sw())), await ev(() => os.wimp.windows.size));

  ok('no page errors, no reported errors', logs.filter((l) => /PAGEERROR|^error:/.test(l)).length === 0, logs);
} catch (e) {
  out.push('FAIL exception ' + (e.stack || e));
} finally {
  await browser.close();
  console.log(out.join('\n'));
  console.log(`${out.filter((l) => l.startsWith('PASS')).length}/${out.length} passed`);
  process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
}
