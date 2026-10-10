// !Word's hyperlinks in the real desktop (./LinkBox, ./LinkOps):
// Ctrl-K by a real key with a selection (its text in the box, the
// address typed, Return: one undo step, an External relationship,
// the caret after the link), with a caret (the text typed in the
// box), on an existing link (Edit hyperlink: the ScreenTip typed),
// a javascript: address refused with a beep and a message (the box
// kept, nothing changed), Escape, Remove link by a real click (the
// runs as they were, bold kept; Ctrl-Z puts the link back), a link
// to a bookmark picked from the box's popup by real clicks and a
// real Ctrl-click on it moving the caret to the bookmark (scrolled
// into view; a Ctrl-click on a web link only places the caret),
// Insert > Hyperlink... (Ctrl+K, Cmd+K on a Mac) and Cmd-K on a Mac,
// Save, close (the box deleted with the document) and reopen keep
// the links (copying one gives <a href>: ./ClipLinks), no network
// request for any address, 20 open / close cycles leak nothing.
// Bookmarks (./BookmarkBox, ./Bookmarks): Ctrl+Shift+F5 with a
// selection, a name typed, Return: the marks round it (one undo
// step); real Right / Left / Backspace next to the marks (one press
// per visible character, the marks kept); the popup by location and
// by name, Go to (the box kept), a bad name and a 41-character one
// refused with a beep and a message, Go to a bookmark in a table
// refused, Delete; Insert > Bookmark... (Ctrl+Shift+F5, on a Mac
// too); the box deleted with its document; 20 cycles leak nothing.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const O = '￼';
const BM = '<w:bookmarkStart w:id="0" w:name="Target"/>';
const LONG = 'https://example.com/' + 'a'.repeat(1480);
const files = {
  Links: Array.from(await buildDocx({ 'word/document.xml': documentXml([
    p(r('Hello ') + r('bold', '<w:b/>') + r(' world')), p(r('Second line here')),
    ...Array.from({ length: 30 }, (_, i) => p(r('Filler paragraph ' + i))),
    p(BM + r('Target here') + '<w:bookmarkEnd w:id="0"/>'),
    p('<w:hyperlink w:anchor="Target"><w:r><w:t>first</w:t></w:r></w:hyperlink>' +
      '<w:hyperlink w:anchor="Other"><w:r><w:t>second</w:t></w:r></w:hyperlink>'),
    p('<w:bookmarkStart w:id="1" w:name="Other"/>' + r('Other place') + '<w:bookmarkEnd w:id="1"/>'),
    p('<w:bookmarkStart w:id="2" w:name="Bad\uFFFC"/>' + r('bad name') + '<w:bookmarkEnd w:id="2"/>'),
    p('<w:hyperlink r:id="rLong"><w:r><w:t>long</w:t></w:r></w:hyperlink>'),
    '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:p><w:bookmarkStart w:id="5" w:name="InTable"/>'
    + '<w:r><w:t>cell</w:t></w:r><w:bookmarkEnd w:id="5"/></w:p></w:tc></w:tr></w:tbl>', p(r('After the table'))].join('')) },
  { docRels: [['rLong', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', LONG, 'External']] })),
};
const TARGET = 32, PAIR = 33, OTHER = 34, LONGP = 36;

const out = [];
const ok = (name, v, detail) => { out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + String(JSON.stringify(detail)).slice(0, 1200)}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const { browser, page, logs } = await launch();
const origin = new URL(BASE_URL).origin;
const requests = [];
page.on('request', (q) => { const u = q.url(); if (!u.startsWith(origin) && !/^(data|blob):/.test(u)) requests.push(u); });
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); await settle(); };
const type = async (t) => { await page.keyboard.type(t, { delay: 5 }); await settle(); };
const click = async (q, opts) => { await wait(600); await page.mouse.click(q.x, q.y, opts); await wait(60); await settle(); };
const icon = (name) => ev((n) => window.__icon(n), name);
const st = () => ev(() => window.__st());
const sel = (i, a, j = i, b = a) => ev(([i, a, j, b]) => window.__sel(i, a, j, b), [i, a, j, b]);

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  const s0 = await ev(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = () => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === 'Links');
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__point = (i, off) => {
      const d = window.__doc(), L = d.view.layout, c = L.caretRect({ id: L.items[i].id, off });
      return window.__client(d.win, c.x + 1, c.y + c.h / 2);
    };
    window.__box = () => {
      const d = window.__doc();
      return d && d.dw.boxes.has('link') ? window.__word().word.dialog({ key: 'link:' + d.docKey, rows: [] }) : null;
    };
    window.__icon = (name) => {
      const w = window.__box().win, b = w.iconByName(name).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    window.__bmBox = () => {
      const d = window.__doc();
      return d && d.dw.boxes.has('bookmark') ? window.__word().word.dialog({ key: 'bookmark:' + d.docKey, rows: [] }) : null;
    };
    window.__bmIcon = (name) => {
      const w = window.__bmBox().win, b = w.iconByName(name).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    window.__bm = (i) => {
      const d = window.__doc(), v = d.view, L = v.layout, b = window.__bmBox(), w = b?.win, c = os.wimp.caret;
      const q = d.d.doc.sections.flatMap((s) => s.blocks)[i];
      const marks = Object.entries(q.inlines ?? {}).filter(([, x]) => /bookmark/.test(x.node?.name ?? ''))
        .map(([off, x]) => [+off, x.node.name.slice(2), ...x.node.attrs.map((a) => a[1])]);
      return { text: q.text, marks, depth: v.undoDepth, beeps: window.__beeps,
        head: v.selection ? [L.byId.get(v.selection.head.id).index, v.selection.head.off] : null,
        anchor: v.selection ? [L.byId.get(v.selection.anchor.id).index, v.selection.anchor.off] : null,
        box: w ? { open: w.isOpen, title: w.title, name: w.iconByName('name').text,
          msg: (w.iconByName('msg').text + ' ' + w.iconByName('msg2').text).trim() } : null,
        caret: c?.window === d.win ? 'doc' : c?.window && c.window === w ? 'box:' + c.icon?.name : c?.window ? 'other' : null };
    };
    window.__popup = () => {
      const lv = os.wimp.menus.levels[0];
      return { open: os.wimp.menus.isOpen, items: lv?.rows.map((x) => x.item.text) ?? [],
        at: (t) => { const k = lv.rows.findIndex((x) => x.item.text === t);
          return window.__client(lv.win, 20, (lv.rows[k].top + lv.rows[k].bottom) / 2); } };
    };
    window.__sel = (i, a, j, b) => {
      const d = window.__doc(), L = d.view.layout;
      d.view.setSelection({ id: L.items[i].id, off: a }, { id: L.items[j].id, off: b });
      d.dw.view.focus();
    };
    window.__st = () => {
      const d = window.__doc(), v = d.view, L = v.layout, b = window.__box(), c = os.wimp.caret;
      const blocks = d.d.doc.sections.flatMap((s) => s.blocks);
      const links = blocks.flatMap((q, i) => Object.entries(q.inlines ?? {}).filter(([, x]) => x.node?.name === 'w:hyperlink')
        .map(([off, x]) => ({ i, off: +off, text: x.text, attrs: Object.fromEntries(x.node.attrs) })));
      const w = b?.win;
      return { lines: v.lines().slice(0, 2), depth: v.undoDepth, beeps: window.__beeps,
        head: v.selection ? [L.byId.get(v.selection.head.id).index, v.selection.head.off] : null,
        anchor: v.selection ? [L.byId.get(v.selection.anchor.id).index, v.selection.anchor.off] : null,
        runs: blocks[0].runs.map((x) => [x.start, x.end, !!x.rPr?.b, x.rStyle ?? null]),
        links, rels: d.d.doc.rels.filter((x) => /hyperlink$/.test(x.type)).map((x) => [x.id, x.target, x.mode]),
        hstyle: d.d.doc.styles?.styles.has('Hyperlink') ?? null,
        box: w ? { open: w.isOpen, title: w.title, text: w.iconByName('text').text, address: w.iconByName('address').text,
          tip: w.iconByName('tip').text, msg: (w.iconByName('msg').text + ' ' + w.iconByName('msg2').text).trim(),
          removeShaded: !!w.iconByName('button:Remove link').shaded, textShaded: !!w.iconByName('text').shaded } : null,
        caret: c?.window === d.win ? 'doc' : c?.window && c.window === w ? 'box:' + c.icon?.name : c?.window ? 'other' : null,
        scrollY: d.win.scrollY };
    };
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await os.filer.run('RAM::RamDisc0.$.Links');
    for (let i = 0; i < 200 && !window.__doc(); i++) await window.__sleep(50);
    window.__doc().win.open({ x: 40, y: 40, w: 640, h: 330, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    return { ok: !!window.__doc(), msgs: window.__msgs };
  }, files);
  ok('the document opens', s0.ok && !s0.msgs.length, s0);
  const base = await ev(() => ({ windows: os.wimp.windows.size }));

  // ---------------------------------------------------- Ctrl-K with a selection
  await click(await ev(() => window.__point(0, 2)));
  await sel(0, 6, 0, 10);
  const d0 = (await st()).depth;
  await press('Control+k');
  const a1 = await st();
  ok('Ctrl-K with "bold" selected opens Insert hyperlink: the text "bold", address and tip empty, Remove link shaded, the caret in the box',
    a1.box?.open && a1.box.title === 'Insert hyperlink' && a1.box.text === 'bold' && a1.box.address === '' && a1.box.tip === ''
    && a1.box.removeShaded && /^box:/.test(a1.caret) && a1.depth === d0, a1);
  await press('Tab');
  await type('www.example.com');
  await press('Enter');
  const a2 = await st();
  const l0 = a2.links.find((x) => x.i === 0);
  ok('... the address typed, Return: one link over "bold", one undo step, the box gone, the caret after the link in the document',
    a2.lines[0] === 'Hello ' + O + ' world' && l0?.text === 'bold' && l0.attrs['w:history'] === '1' && a2.depth === d0 + 1
    && !a2.box && a2.caret === 'doc' && same(a2.head, [0, 7]), a2);
  ok('... a new External relationship (http:// put before www.) and the Hyperlink style',
    a2.rels.length === 2 && a2.rels[1][1] === 'http://www.example.com' && a2.rels[1][2] === 'External'
    && l0.attrs['r:id'] === a2.rels[1][0] && a2.hstyle === true, a2.rels.map((x) => x[0]));

  // ---------------------------------------------------- Ctrl-K at a caret: the text typed in the box
  await click(await ev(() => window.__point(1, 6)));
  await press('Control+k');
  const b1 = await st();
  ok('Ctrl-K at a caret: Insert hyperlink, the text empty', b1.box?.title === 'Insert hyperlink' && b1.box.text === '', b1);
  await type('Click me');
  await press('Tab');
  await type('https://x.org/a b');
  await press('Enter');
  const b2 = await st();
  const l1 = b2.links.find((x) => x.i === 1);
  ok('... "Click me" goes in as the link text; the space in the address encoded; one undo step',
    b2.lines[1] === 'Second' + O + ' line here' && l1?.text === 'Click me' && b2.rels.at(-1)[1] === 'https://x.org/a%20b'
    && b2.depth === a2.depth + 1 && !b2.box, b2);

  // ---------------------------------------------------- edit: the ScreenTip
  await sel(0, 7);
  await press('Control+k');
  const c1 = await st();
  ok('Ctrl-K next to a link: Edit hyperlink with its text and address, Remove link live',
    c1.box?.title === 'Edit hyperlink' && c1.box.text === 'bold' && c1.box.address === 'http://www.example.com'
    && !c1.box.removeShaded, c1);
  await click(await icon('tip'));
  await type('A tip');
  await press('Enter');
  const c2 = await st();
  const l2 = c2.links.find((x) => x.i === 0);
  ok('... a ScreenTip typed, Return: w:tooltip set, no new relationship, one undo step',
    l2?.attrs['w:tooltip'] === 'A tip' && c2.rels.length === b2.rels.length && c2.depth === b2.depth + 1 && !c2.box, c2);

  // ---------------------------------------------------- refused: javascript:
  await sel(1, 7);
  await press('Control+k');
  await click(await icon('address'));
  await press('Control+u');
  await type('javascript:alert(1)');
  await press('Enter');
  const e1 = await st();
  ok('a javascript: address: a beep and a message, the box kept, nothing changed',
    e1.beeps === c2.beeps + 1 && /not allowed/.test(e1.box?.msg) && e1.box?.open && e1.depth === c2.depth
    && same(e1.links, c2.links) && same(e1.rels, c2.rels), e1);
  await press('Escape');
  const e2 = await st();
  ok('... Escape: the box gone, nothing changed, the caret back in the document', !e2.box && e2.depth === c2.depth
    && same(e2.links, c2.links) && e2.caret === 'doc', e2);

  // ---------------------------------------------------- Remove link
  await sel(0, 7);
  await press('Control+k');
  await click(await icon('button:Remove link'));
  const f1 = await st();
  ok('Remove link (a real click): the runs back as they were, "bold" bold, no Hyperlink style on them, the caret after them; one undo step',
    f1.lines[0] === 'Hello bold world' && same(f1.runs, [[0, 6, false, null], [6, 10, true, null], [10, 16, false, null]])
    && !f1.links.some((x) => x.i === 0) && f1.depth === c2.depth + 1 && same(f1.anchor, [0, 10]) && same(f1.head, [0, 10]) && !f1.box, f1);
  await press('Control+z');
  const f2 = await st();
  ok('... Ctrl-Z puts the link back', f2.lines[0] === 'Hello ' + O + ' world' && same(f2.links, c2.links), f2);

  // ---------------------------------------------------- a link to a bookmark, Ctrl-click
  await sel(1, 0, 1, 6);
  await press('Control+k');
  await click(await icon('arrow:marks'));
  const g0 = await ev(() => {
    const lv = os.wimp.menus.levels[0], k = lv?.rows.findIndex((x) => x.item.text === 'Target');
    return { open: os.wimp.menus.isOpen, items: lv?.rows.map((x) => x.item.text),
      pos: k >= 0 ? window.__client(lv.win, 20, (lv.rows[k].top + lv.rows[k].bottom) / 2) : null };
  });
  ok('the Bookmark popup lists the document\'s bookmarks (not one whose name holds U+FFFC)', g0.open && same(g0.items, ['(none)', 'Target', 'Other', 'InTable']), g0);
  await click(g0.pos);
  const g1 = await st();
  ok('... picking Target puts #Target in the address', g1.box?.address === '#Target', g1);
  await press('Enter');
  const g2 = await st();
  const l3 = g2.links.find((x) => x.i === 1 && x.off === 0);
  ok('... Return: a link to the bookmark (w:anchor, no relationship)', l3?.attrs['w:anchor'] === 'Target' && !l3.attrs['r:id']
    && l3.text === 'Second' && g2.rels.length === f2.rels.length, g2);
  const pt = await ev(() => window.__point(1, 1));
  await wait(600);
  await page.keyboard.down('Control');
  await page.mouse.click(pt.x - 6, pt.y);
  await page.keyboard.up('Control');
  await wait(60);
  await settle();
  const g3 = await st();
  ok('a real Ctrl-click on it: the caret at the bookmark, scrolled into view; nothing changed',
    same(g3.head, [TARGET, 0]) && g3.scrollY > 0 && g3.depth === g2.depth && g3.caret === 'doc', g3);
  await ev(() => { window.__doc().win.scrollTo(0, 0); });
  await settle();
  const pu = await ev(() => window.__point(0, 7));
  await wait(600);
  await page.keyboard.down('Control');
  await page.mouse.click(pu.x - 4, pu.y);
  await page.keyboard.up('Control');
  await wait(60);
  await settle();
  const g4 = await st();
  ok('a Ctrl-click on a web link only places the caret there (never opened)', g4.head[0] === 0 && g4.scrollY === 0
    && g4.depth === g2.depth && page.context().pages().length === 1, g4);

  // ---------------------------------------------------- review fixes: the link under the pointer, Cmd-click
  await sel(PAIR, 0);
  const pp = await ev((i) => window.__point(i, 1), PAIR);
  await wait(600);
  await page.keyboard.down('Control');
  await page.mouse.click(pp.x + 4, pp.y);
  await page.keyboard.up('Control');
  await wait(60);
  await settle();
  const r1 = await st();
  ok('Ctrl-click on the left half of a link right after another link follows the link under the pointer (Other, not Target)',
    same(r1.head, [OTHER, 0]), r1);
  await sel(PAIR, 0);
  const mac1 = await ev(() => { const v = window.__doc().dw.view, m = v.mac; v.mac = true; return m; });
  const pq = await ev((i) => window.__point(i, 0), PAIR);
  await wait(600);
  await page.keyboard.down('Meta');
  await page.mouse.click(pq.x + 6, pq.y);
  await page.keyboard.up('Meta');
  await wait(60);
  await settle();
  const r2 = await st();
  ok('on a Mac Cmd-click on a link to a bookmark goes there too', same(r2.head, [TARGET, 0]), r2);
  await ev((m) => { window.__doc().dw.view.mac = m; }, mac1);
  // an address longer than the field: shaded, kept as it is when only the text changes
  await sel(LONGP, 1);
  await press('Control+k');
  const r3 = await ev(() => ({ shaded: !!window.__box().win.iconByName('address').shaded, text: window.__box().win.iconByName('address').text }));
  await click(await icon('text'));
  await press('Control+u');
  await type('longer');
  await press('Enter');
  const r4 = await st();
  const ll = r4.links.find((x) => x.i === LONGP);
  ok('a link with a 1500-character address: the address field shaded; editing only the text keeps its relationship (no new, cut-short one)',
    r3.shaded && r3.text === '' && ll?.text === 'longer' && ll.attrs['r:id'] === 'rLong' && r4.rels.length === g2.rels.length + 0
    && !r4.rels.some((x) => x[1] !== LONG && x[1].startsWith('https://example.com/a')), { r3, ll, rels: r4.rels.length });
  // a #name with U+FFFC typed in the box is refused
  await sel(OTHER, 1, OTHER, 6);
  await press('Control+k');
  await click(await icon('address'));
  await press('Control+u');
  await type('#Bad\uFFFC');
  // (the writable field itself drops a typed U+FFFC: put it there as a paste would)
  const typed = await ev(() => window.__box().win.iconByName('address').text);
  await ev(() => window.__box().set('address', '#Bad\uFFFC'));
  const b0 = (await st()).beeps;
  await click(await icon('button:OK'));
  const r5 = await st();
  ok('#name holding U+FFFC in the box: a beep and a message, nothing changed (typed, the field drops it)', typed === '#Bad'
    && r5.beeps === b0 + 1 && r5.box?.open
    && r5.box.address === '#Bad\uFFFC'
    && /bookmark name/.test(r5.box.msg) && r5.depth === r4.depth, { b0, beeps: r5.beeps, box: r5.box, d: [r4.depth, r5.depth], l: r5.links.find((x) => x.i === LONGP) });
  await press('Escape');

  // ---------------------------------------------------- the Insert menu, Mac Cmd-K
  const mn = await ev(() => {
    const d = window.__doc(), v = d.dw.view;
    const row = (m) => m.items.find((i) => i.text === 'Hyperlink...');
    const ins = () => d.win.menu({}).items.find((i) => i.text === 'Insert').submenu();
    const m0 = v.mac;
    v.mac = false;
    const r1 = row(ins());
    v.mac = true;
    const r2 = row(ins());
    v.mac = m0;
    return { key: r1.key, mac: r2.key, shaded: typeof r1.shaded === 'function' ? r1.shaded() : !!r1.shaded };
  });
  ok('Insert > Hyperlink... is live with Ctrl+K (Cmd+K on a Mac)', mn.key === 'Ctrl+K' && mn.mac === 'Cmd+K' && !mn.shaded, mn);
  const mac0 = await ev(() => { const v = window.__doc().dw.view, m = v.mac; v.mac = true; return m; });
  await sel(0, 1);
  await press('Meta+k');
  const h1 = await st();
  ok('on a Mac Cmd-K opens the box', h1.box?.open && h1.box.title === 'Insert hyperlink', { box: h1.box, caret: h1.caret, head: h1.head });
  await press('Escape');
  await ev((m) => { window.__doc().dw.view.mac = m; }, mac0);
  await ev(async () => {
    const d = window.__doc(), m = d.win.menu({}).items.find((i) => i.text === 'Insert').submenu();
    m.items.find((i) => i.text === 'Hyperlink...').action();
    await window.__frames(2);
  });
  const h2 = await st();
  ok('Insert > Hyperlink... opens it too', h2.box?.open === true, h2);
  await press('Escape');

  // ---------------------------------------------------- bookmarks
  const bm = (i) => ev((i) => window.__bm(i), i);
  const bmIcon = (name) => ev((n) => window.__bmIcon(n), name);
  const popupAt = (t) => ev((t) => window.__popup().at(t), t);
  const popupItems = () => ev(() => window.__popup().items);
  await sel(2, 0, 2, 6);
  const qm0 = await bm(2);
  await press('Control+Shift+F5');
  const qm1 = await bm(2);
  ok('Ctrl+Shift+F5 with "Filler" selected opens the Bookmark box, the caret in its name field, nothing changed',
    qm1.box?.open && qm1.box.title === 'Bookmark' && qm1.box.name === '' && qm1.caret === 'box:name' && qm1.depth === qm0.depth, qm1);
  await type('Mine');
  await press('Enter');
  const qm2 = await bm(2);
  ok('... "Mine", Return: a start and an end round "Filler" (id 6: one more than the largest, the table\'s 5 included), one undo step, the box gone, the text selected',
    same(qm2.marks, [[0, 'bookmarkStart', '6', 'Mine'], [7, 'bookmarkEnd', '6']]) && qm2.depth === qm0.depth + 1 && !qm2.box
    && same(qm2.anchor, [2, 1]) && same(qm2.head, [2, 7]) && qm2.caret === 'doc', qm2);
  await sel(2, 0);
  await press('ArrowRight');
  const qk1 = await bm(2);
  await sel(2, 6);
  await press('ArrowRight');
  const qk2 = await bm(2);
  await press('ArrowRight');
  const qk3 = await bm(2);
  await press('ArrowLeft');
  await press('ArrowLeft');
  const qk4 = await bm(2);
  await press('Shift+ArrowLeft');
  const qk5 = await bm(2);
  ok('real Right / Left go over a mark with the next character (one press per visible character), Shift too',
    same(qk1.head, [2, 2]) && same(qk2.head, [2, 7]) && same(qk3.head, [2, 9]) && same(qk4.head, [2, 6])
    && same(qk5.anchor, [2, 6]) && same(qk5.head, [2, 5]), { qk1: qk1.head, qk2: qk2.head, qk3: qk3.head, qk4: qk4.head, qk5: [qk5.anchor, qk5.head] });
  await sel(2, 8);
  await press('Backspace');
  const qk6 = await bm(2);
  await sel(2, 0);
  await press('Delete');
  const qk7 = await bm(2);
  ok('real Backspace after the end mark deletes "r", Delete before the start deletes "F": the marks kept',
    qk6.text.startsWith('\uFFFCFille\uFFFC ') && qk7.text.startsWith('\uFFFCille\uFFFC ') && qk7.marks.length === 2
    && qk7.depth === qm2.depth + 2, { qk6: qk6.text.slice(0, 10), qk7: qk7.text.slice(0, 10), marks: qk7.marks });
  await press('Control+z');
  await press('Control+z');
  ok('... Ctrl-Z twice: back as it was', (await bm(2)).text === qm2.text, (await bm(2)).text);
  await sel(1, 0);
  await press('Control+Shift+F5');
  await click(await bmIcon('arrow:names'));
  const pl = await popupItems();
  ok('the popup lists the bookmarks by location (hidden ones not; the one in a table too)',
    same(pl, ['(none)', 'Mine', 'Target', 'Other', 'Bad\uFFFC', 'InTable']), pl);
  await click(await popupAt('(none)'));
  await click(await bmIcon('byName'));
  await click(await bmIcon('arrow:names'));
  const pn = await popupItems();
  ok('... Sort by Name: by name, case ignored', same(pn, ['(none)', 'Bad\uFFFC', 'InTable', 'Mine', 'Other', 'Target']), pn);
  await click(await popupAt('Target'));
  const qg5 = await bm(TARGET);
  await click(await bmIcon('button:Go to'));
  const qg6 = await bm(TARGET);
  ok('picking Target puts its name in the field; Go to selects its text and keeps the box, nothing changed',
    qg5.box?.name === 'Target' && same(qg6.anchor, [TARGET, 1]) && same(qg6.head, [TARGET, 12]) && qg6.box?.open
    && qg6.depth === qg5.depth, { qg5: qg5.box, qg6 });
  await click(await bmIcon('name'));
  await press('Control+u');
  await type('1bad');
  await click(await bmIcon('button:Add'));
  const qb1 = await bm(1);
  ok('a name with a digit first: a beep and why, the box kept, nothing changed',
    qb1.beeps === qg6.beeps + 1 && qb1.box?.open && /letter/.test(qb1.box.msg) && qb1.depth === qg6.depth, qb1);
  await ev(() => window.__bmBox().set('name', 'x'.repeat(41)));
  await click(await bmIcon('button:Add'));
  const qb2 = await bm(1);
  ok('a 41-character name (put in as a paste would): refused with a beep', qb2.beeps === qb1.beeps + 1 && /40/.test(qb2.box?.msg)
    && qb2.depth === qg6.depth, qb2.box);
  await ev(() => window.__bmBox().set('name', 'InTable'));
  await click(await bmIcon('button:Go to'));
  const qb3 = await bm(1);
  ok('Go to a bookmark in a table: refused with a beep and a message', qb3.beeps === qb2.beeps + 1 && /table/.test(qb3.box?.msg)
    && qb3.box.open, qb3.box);
  await ev(() => window.__bmBox().set('name', 'mine'));
  await click(await bmIcon('button:Delete'));
  const qb4 = await bm(2);
  ok('Delete "mine" (case ignored): both marks gone, one undo step, the box kept and says so with the stored name "Mine"',
    !qb4.marks.length && qb4.text.startsWith('Filler') && qb4.depth === qb3.depth + 1 && qb4.box?.open && /"Mine" is deleted/.test(qb4.box.msg), qb4);
  await press('Escape');
  const qb5 = await bm(2);
  ok('Escape closes it (Close), the caret back in the document', !qb5.box && qb5.caret === 'doc' && qb5.depth === qb4.depth, qb5);
  const bmn = await ev(async () => {
    const d = window.__doc(), v = d.dw.view, qm0 = v.mac;
    const row = () => d.win.menu({}).items.find((i) => i.text === 'Insert').submenu().items.find((i) => i.text === 'Bookmark...');
    v.mac = true;
    const mac = row().key;
    v.mac = qm0;
    const r = row();
    r.action();
    await window.__frames(2);
    return { key: r.key, mac, shaded: typeof r.shaded === 'function' ? r.shaded() : !!r.shaded, open: !!window.__bmBox()?.isOpen };
  });
  ok('Insert > Bookmark... is live with Ctrl+Shift+F5 (Ctrl on a Mac too) and opens the box',
    bmn.key === 'Ctrl+Shift+F5' && bmn.mac === 'Ctrl+Shift+F5' && !bmn.shaded && bmn.open, bmn);
  await press('Escape');

  // ---------------------------------------------------- leaks
  const counts = () => ev(() => {
    const t = window.__word(), n = (e) => [...e._h.values()].reduce((a, l) => a + l.length, 0);
    return { win: os.wimp.windows.size, task: t.windows.size, icons: document.querySelectorAll('.icon').length,
      wl: n(os.wimp), tl: n(t), menus: os.wimp.menus.isOpen };
  });
  const k0 = await counts();
  for (let i = 0; i < 20; i++) {
    await press('Control+k');
    await press('Escape');
  }
  const k1 = await counts();
  ok('20 Ctrl-K / Escape cycles leave nothing behind', same(k0, k1), { k0, k1 });
  for (let i = 0; i < 20; i++) {
    await press('Control+Shift+F5');
    await press('Escape');
  }
  const k2 = await counts();
  ok('20 Ctrl+Shift+F5 / Escape cycles leave nothing behind', same(k0, k2), { k0, k2 });

  // ---------------------------------------------------- Save, close, reopen
  const sv = await ev(async () => {
    const d = window.__doc();
    d.save();
    for (let i = 0; i < 100 && d.saving; i++) await window.__sleep(30);
    d.dw.view.focus();
    return { dirty: d.view.dirty, path: d.path };
  });
  await press('Control+Shift+F5');
  const zb = await ev(() => { window.__bb = window.__bmBox()?.win; return !!window.__bb?.isOpen; });
  await ev(() => window.__doc().dw.view.focus());
  await press('Control+k');
  const z0 = await ev(() => { window.__bw = window.__box()?.win; return { box: !!window.__bw }; });
  await ev(async () => { window.__doc().requestClose(); await window.__frames(3); });
  const z1 = await ev(() => ({ doc: !!window.__doc(), gone: ![...os.wimp.windows.values()].includes(window.__bw),
    bgone: ![...os.wimp.windows.values()].includes(window.__bb), win: os.wimp.windows.size }));
  ok('saved; closing the document deletes its open Hyperlink and Bookmark boxes', !sv.dirty && z0.box && zb && !z1.doc
    && z1.gone && z1.bgone && z1.win < base.windows, { sv, z0, zb, z1, base });
  await ev(async (p) => {
    await window.__word().word.open(p);
    for (let i = 0; i < 200 && !window.__doc(); i++) await window.__sleep(50);
    window.__doc().win.open({ x: 40, y: 40, w: 640, h: 330, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
  }, sv.path);
  const z2 = await st();
  const html = await ev(() => {
    const d = window.__doc(), L = d.view.layout;
    d.view.setSelection({ id: L.items[0].id, off: 6 }, { id: L.items[0].id, off: 7 });
    return d.copy()?.html ?? '';
  });
  ok('reopened: the three links are there (web, web, bookmark) with their tip and relationships',
    same(z2.links.filter((x) => x.i < 2).map((x) => [x.i, x.off, x.text]), [[0, 6, 'bold'], [1, 0, 'Second'], [1, 1, 'Click me']])
    && z2.links[0].attrs['w:tooltip'] === 'A tip' && z2.links[1].attrs['w:anchor'] === 'Target'
    && z2.rels.some((x) => x[1] === 'http://www.example.com' && x[2] === 'External'), z2);
  ok('... copying the link gives other programs <a href> with its URL (ClipLinks)',
    /<a href="http:\/\/www\.example\.com"/.test(html), html.slice(0, 400));
  ok('no network request was made for any address', !requests.length, requests);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
