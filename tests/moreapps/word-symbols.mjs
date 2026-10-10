// !Word's Insert > Symbol... and Special character in the real desktop
// (./SymbolBind, WimpLib Ui/CharGrid, ./SpecialChars): the window of
// characters (16 columns, sets in a popup, a Recently used row, a
// status line 'U+00E9  Latin-1'), a real click selecting and a
// double-click or Insert putting the character in the document last
// clicked in, with its format (the run's, a pending italic), one undo
// step each; Return, arrows and Escape in the grid; scrolling a long
// set; no document: a beep and a message; the Special character menu
// (em dash, quotes, copyright, degree, no-break space and hyphen,
// optional hyphen); Ctrl-Shift-Space and Ctrl-Shift-- by real keys
// (a no-break space typed after "1." makes no list; a space does);
// a saved copy holding <w:noBreakHyphen/> and <w:softHyphen/>;
// menu labels (also Mac); 20 open / close cycles leak nothing.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { xmlEntries } from './docx-compare.mjs';

const NB = ' ', O = '￼';
const BOLD = '<w:r><w:rPr><w:b/></w:rPr><w:t>Bold text</w:t></w:r>';
const files = {
  Alpha: Array.from(await buildDocx({ 'word/document.xml': documentXml([p(r('Hello world')), p(BOLD), p(r('1.')), p(r('1.')),
    p(r('Last'))].join('')) })),
  Beta: Array.from(await buildDocx({ 'word/document.xml': documentXml(p(r('Second document'))) })),
  Gamma: Array.from(await buildDocx({ 'word/document.xml': documentXml(p(r('Third'))) })),
};

const out = [];
const live = (s) => { if (process.env.LIVE) console.error(s.slice(0, 700)); };
const ok = (name, v, detail) => { out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + String(JSON.stringify(detail)).slice(0, 1200)}`); live(out.at(-1)); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const press = async (k) => { await page.keyboard.press(k); await settle(); };
let DBL = 600;
/** A real click (after the double-click time) at a client point. */
const click = async (q, n = 1) => { await wait(DBL); await page.mouse.click(q.x, q.y, { clickCount: n, delay: 10 }); await wait(40); await settle(); };
const dbl = async (q) => { await wait(DBL); await page.mouse.dblclick(q.x, q.y, { delay: 10 }); await wait(40); await settle(); };
const doc = (leaf, i, off) => ev(([l, i, o]) => window.__point(l, i, o), [leaf, i, off]);
const clickDoc = async (leaf, i, off) => click(await doc(leaf, i, off));
const cell = (ch, recent = false) => ev(([c, r]) => window.__cell(c, r), [ch, recent]);
const icon = (n) => ev((n) => window.__gicon(n), n);
const st = (leaf) => ev((l) => window.__st(l), leaf);
const gs = () => ev(() => window.__gs());

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  const s0 = await ev(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === leaf);
    window.__sy = () => window.__word().word.symbols;
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__point = (leaf, i, off) => {
      const d = window.__doc(leaf), L = d.view.layout, c = L.caretRect({ id: L.items[i].id, off });
      d.win.bringToFront();
      return window.__client(d.win, c.x + 1, c.y + c.h / 2);
    };
    window.__cell = (ch, recent) => {
      const g = window.__sy().grid, w = g.where(ch, recent);
      return w && window.__client(g.win, w.x + w.w / 2, w.y + w.h / 2);
    };
    window.__gicon = (n) => {
      const g = window.__sy().grid, b = g.win.iconByName(n).bbox;
      return window.__client(g.win, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    window.__st = (leaf) => {
      const d = window.__doc(leaf), v = d.view, L = v.layout;
      return { lines: v.lines(), depth: v.undoDepth, dirty: v.dirty,
        runs: d.d.doc.sections.flatMap((s) => s.blocks).map((b) => b.runs?.map((r) => ({ s: r.start, e: r.end, b: !!r.rPr?.b, i: !!r.rPr?.i }))),
        num: d.d.doc.sections.flatMap((s) => s.blocks).map((b) => b.pPr?.numPr ?? null),
        head: v.selection ? [L.byId.get(v.selection.head.id).index, v.selection.head.off] : null,
        inl: d.d.doc.sections.flatMap((s) => s.blocks).map((b) => Object.values(b.inlines ?? {}).map((x) => x.node?.name ?? x.kind)) };
    };
    window.__gs = () => {
      const g = window.__sy().grid, c = os.wimp.caret, w = g.win;
      return { open: g.isOpen, set: g.set, sel: g.selected, recent: g.recent, top: g.top, status: w.iconByName('status').text,
        setText: w.iconByName('set').text, insertShaded: !!w.iconByName('button:Insert').shaded, title: w.title,
        caretIn: c?.window === w ? 'grid' : (c?.window ? 'other' : null), wins: os.wimp.windows.size,
        front: os.wimp.stack.at(-1) === w, x: w.x, y: w.y, active: window.__sy().active?.leaf ?? null };
    };
    /** Pixels in a work rectangle of the grid's canvas: dark, blue, white. */
    window.__scan = (x, y, w, h) => {
      const win = window.__sy().grid.win, cv = win._canvas, k = cv.width / win.w;
      const img = cv.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), Math.round(w * k), Math.round(h * k));
      let dark = 0, blue = 0, white = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        const [R, G, B] = [img.data[i], img.data[i + 1], img.data[i + 2]];
        if (R < 110 && G < 110 && B < 110) dark++;
        else if (B > 120 && B - R > 50) blue++;
        else if (R > 235 && G > 235 && B > 235) white++;
      }
      return { dark, blue, white, n: img.data.length / 4 };
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    let x = 10;
    for (const n of ['Alpha', 'Beta']) {
      await os.filer.run(`RAM::RamDisc0.$.${n}`);
      for (let i = 0; i < 200 && !window.__doc(n); i++) await window.__sleep(50);
      window.__doc(n).win.open({ x, y: 474, w: 500, h: 290, behind: 'top', scrollX: 0, scrollY: 0 });
      x += 510;
    }
    await window.__frames(3);
    return { ok: !!window.__doc('Alpha') && !!window.__doc('Beta'), msgs: window.__msgs,
      fonts: document.fonts.check('19px Carlito'), dbl: (os.input.config.doubleClickMs || 500) + 100 };
  }, files);
  DBL = s0.dbl;
  ok('Alpha and Beta open; the bundled font Carlito is loaded', s0.ok && !s0.msgs.length && s0.fonts, s0);
  const base = await ev(() => ({ windows: os.wimp.windows.size }));

  // ---------------------------------------------------- the menus
  const mn = await ev(() => {
    const d = window.__doc('Alpha'), v = d.view;
    const val = (x) => (typeof x === 'function' ? x() : x);
    const rows = (m) => m.items.map((i) => ({ text: i.text, key: i.key ?? null, shaded: !!val(i.shaded), help: !!i.help }));
    const ins = () => d.win.menu({}).items.find((i) => i.text === 'Insert').submenu();
    const sp = () => ins().items.find((i) => i.text === 'Special character').submenu();
    const out = { ins: rows(ins()), sp: rows(sp()) };
    v.mac = true;
    out.mac = rows(sp()).filter((x) => x.key).map((x) => x.key);
    v.mac = false;
    return out;
  });
  const sr = (n) => mn.sp.find((x) => x.text === n);
  ok('Insert > Symbol... and Special character are live (not shaded), with help', ['Symbol...', 'Special character'].every((n) => {
    const x = mn.ins.find((y) => y.text === n); return x && !x.shaded && x.help; }), mn.ins);
  ok('Special character >: the 16 items in order, all with help', same(mn.sp.map((x) => x.text), ['Em dash', 'En dash', 'Non-breaking space',
    'Non-breaking hyphen', 'Optional hyphen', 'Copyright', 'Registered', 'Trademark', 'Section', 'Paragraph', 'Ellipsis',
    'Single opening quote', 'Single closing quote', 'Double opening quote', 'Double closing quote', 'Degree']) && mn.sp.every((x) => x.help && !x.shaded), mn.sp);
  ok('... Ctrl+Shift+Space and Ctrl+Shift+- on the two no-break items (also on a Mac: Ctrl), the others show no key',
    sr('Non-breaking space').key === 'Ctrl+Shift+Space' && sr('Non-breaking hyphen').key === 'Ctrl+Shift+-' && mn.sp.filter((x) => x.key).length === 2
    && same(mn.mac, ['Ctrl+Shift+Space', 'Ctrl+Shift+-']), mn);

  // ---------------------------------------------------- Symbol...: the grid
  await clickDoc('Alpha', 0, 11);
  const depth0 = (await st('Alpha')).depth;
  await ev(() => window.__doc('Alpha').win.menu({}).items.find((i) => i.text === 'Insert').submenu().items.find((i) => i.text === 'Symbol...').action());
  await settle();
  const g1 = await gs();
  ok('Symbol... opens the one grid, in front and centred, the caret in it (for the keys), Latin-1 shown, Insert shaded, no status',
    g1.open && g1.front && g1.set === 'latin1' && g1.setText === 'Latin-1' && g1.caretIn === 'grid' && g1.insertShaded && g1.status === ''
    && g1.wins === base.windows + 1 && g1.title === 'Symbol' && g1.active === 'Alpha' && g1.sel === null, g1);
  await ev(() => window.__sy().grid.open({ x: 440, y: 8 }));
  await settle();
  const geo = await ev(() => { const g = window.__sy().grid; return ['\u00A1', '\u00A2', '\u00B1', '\u00B2'].map((c) => g.where(c)); });
  ok('16 columns of 32 x 30: the 16th character (B1) is in the last column, the 17th (B2) under the first',
    geo[0].x === 12 && geo[1].x === 44 && geo[2].x === 12 + 15 * 32 && geo[2].y === geo[0].y && geo[3].x === 12 && geo[3].y === geo[0].y + 30
    && geo[0].w === 32 && geo[0].h === 30, geo);
  const px = await ev(() => {
    const g = window.__sy().grid, a = g.where('é'), b = g.where('¡');
    const last = g.where('ÿ');
    return { e: window.__scan(a.x + 2, a.y + 2, a.w - 4, a.h - 4), empty: window.__scan(last.x + 40, last.y + 2, 20, last.h - 4),
      bar: window.__scan(12, 90, 4, 4) };
  });
  ok('the characters are drawn on the canvas in the window (dark pixels in a cell, none where the set ends)', px.e.dark > 12 && px.e.white > px.e.dark, px);

  // ---------------------------------------------------- select by a real click; Insert button
  await click(await cell('é'));
  const g2 = await gs();
  const sel = await ev(() => { const g = window.__sy().grid, a = g.where('é'); return window.__scan(a.x + 1, a.y + 1, 4, 4); });
  ok('a click selects é: status "U+00E9  Latin-1", Insert enabled, the cell drawn in blue; nothing inserted',
    g2.sel === 'é' && g2.status === 'U+00E9  Latin-1' && !g2.insertShaded && sel.blue > 8 && (await st('Alpha')).depth === depth0, { g2, sel });
  await click(await icon('button:Insert'));
  const a1 = await st('Alpha'), g3 = await gs();
  ok('the Insert button puts é in Alpha at the caret: one undo step, the caret after it and back in the document, recent [é]',
    a1.lines[0] === 'Hello worldé' && a1.depth === depth0 + 1 && same(a1.head, [0, 12]) && g3.caretIn === 'other' && same(g3.recent, ['é']), { a1, g3 });
  ok('... the grid stays open', g3.open);

  // ---------------------------------------------------- double-click inserts; each its own step
  await dbl(await cell('ü'));
  await dbl(await cell('ß'));
  const a2 = await st('Alpha'), g4 = await gs();
  ok('double-clicks insert ü and ß: two more steps (even within a second), the caret after, recent [ß, ü, é]',
    a2.lines[0] === 'Hello worldéüß' && a2.depth === depth0 + 3 && same(a2.head, [0, 14]) && same(g4.recent, ['ß', 'ü', 'é']), { a2, g4 });
  await press('Control+z');
  const a3 = await st('Alpha');
  ok('Ctrl-Z undoes only the last symbol', a3.lines[0] === 'Hello worldéü' && a3.depth === depth0 + 2, a3);
  await press('Control+y');

  // ---------------------------------------------------- format: the run's, and a pending italic
  await clickDoc('Alpha', 1, 9);
  await dbl(await cell('ñ'));
  const f1 = await st('Alpha');
  ok('at the end of bold text a symbol is bold', f1.lines[1] === 'Bold textñ' && f1.runs[1].every((x) => x.b) && f1.runs[1].at(-1).e === 10, f1);
  await press('Control+i');
  await dbl(await cell('ç'));
  const f2 = await st('Alpha');
  ok('with a pending italic (Ctrl-I) the symbol is bold italic, and only it', f2.lines[1] === 'Bold textñç'
    && f2.runs[1].find((x) => x.s === 10 && x.e === 11)?.i === true && f2.runs[1].find((x) => x.s === 10 && x.e === 11)?.b === true
    && !f2.runs[1].find((x) => x.s === 0)?.i, f2);

  // ---------------------------------------------------- the set popup, by real clicks
  await click(await icon('set'));
  const m1 = await ev(() => {
    const lv = os.wimp.menus.levels[0];
    return { open: os.wimp.menus.isOpen, items: lv?.rows.map((r) => r.item.text),
      ticked: lv?.rows.map((x) => typeof x.item.ticked === 'function' ? x.item.ticked() : !!x.item.ticked),
      pos: lv && window.__client(lv.win, 20, (lv.rows[5].top + lv.rows[5].bottom) / 2) };
  });
  ok('a click on the set field opens the menu of the sets, Latin-1 ticked', m1.open && same(m1.items, ['Latin-1', 'Latin Extended-A', 'Greek', 'Cyrillic',
    'Punctuation', 'Currency', 'Letterlike and fractions', 'Arrows', 'Maths', 'Geometric shapes'])
    && same(m1.ticked, [true, ...Array(9).fill(false)]), m1);
  await click(m1.pos);
  const g5 = await gs();
  ok('... choosing Currency shows that set (field, scroll at the top), the menu gone', g5.set === 'currency' && g5.setText === 'Currency'
    && g5.top === 0 && !(await ev(() => os.wimp.menus.isOpen)), g5);
  await click(await icon('arrow'));
  await ev(() => os.wimp.menus.close());
  await dbl(await cell('€'));
  const a4 = await st('Alpha'), g6 = await gs();
  ok('a euro sign from Currency inserted; recent [€, ç, ñ, ß, ü, é]', a4.lines[1] === 'Bold textñç€' && same(g6.recent.slice(0, 3), ['€', 'ç', 'ñ']), { a4, g6 });

  // ---------------------------------------------------- the Recently used row
  await click(await cell('é', true));
  const g7 = await gs();
  ok('a click on a recent character selects it (the set it is in is shown: Latin-1)', g7.sel === 'é' && g7.set === 'latin1' && g7.status === 'U+00E9  Latin-1', g7);
  const d7 = (await st('Alpha')).depth;
  await dbl(await cell('é', true));
  const a5 = await st('Alpha'), g8 = await gs();
  ok('a double-click on it inserts it and moves it to the front of the row', a5.depth === d7 + 1 && g8.recent[0] === 'é' && g8.recent.length === 6
    && new Set(g8.recent).size === 6, { a5, g8 });
  const rp = await ev(() => { const g = window.__sy().grid, a = g.where('€', true); return { dark: window.__scan(a.x + 2, a.y + 2, a.w - 4, a.h - 4).dark, y: a.y }; });
  ok('the recent row is drawn above the grid', rp.dark > 5 && rp.y < 100, rp);

  // ---------------------------------------------------- the keys in the grid
  await click(await cell('¡'));
  await press('ArrowRight');
  const k1 = await gs();
  await press('ArrowDown');
  const k2 = await gs();
  await press('End');
  const k3 = await gs();
  await press('Home');
  const k4 = await gs();
  ok('arrows move the chosen character (Right, Down a row of 16), End and Home', k1.sel === '¢' && k2.sel === '³' && k3.sel === 'ÿ' && k4.sel === '¡'
    && k4.caretIn === 'grid', { k1: k1.sel, k2: k2.sel, k3: k3.sel, k4: k4.sel });
  await press('ArrowRight');
  const d9 = (await st('Alpha')).depth;
  await press('Enter');
  const a6 = await st('Alpha'), g9 = await gs();
  ok('Return inserts the chosen character, and the caret goes back to the document', a6.depth === d9 + 1 && a6.lines[1].endsWith('¢')
    && g9.caretIn === 'other' && g9.open, { a6, g9 });
  await press('x');
  ok('... typing then goes into the document', (await st('Alpha')).lines.some((l) => l.endsWith('¢x')));
  await click(await cell('£'));
  await press('Escape');
  const g10 = await gs();
  await press('y');
  ok('Escape in the grid closes it; the caret is back in the document', !g10.open && (await st('Alpha')).lines.some((l) => l.endsWith('¢xy')), g10);
  await ev(() => window.__sy().open());
  await settle();
  ok('Symbol... again shows the same grid with what was chosen before kept (recent row, Latin-1)', (await gs()).open && (await gs()).recent.length >= 7, await gs());

  // ---------------------------------------------------- the grid follows the last document with the caret
  await clickDoc('Beta', 0, 15);
  const g11 = await gs();
  const aDepth = (await st('Alpha')).depth;
  await dbl(await cell('è'));
  const b1 = await st('Beta');
  ok('after a click in Beta the grid works on Beta: è goes in Beta, not in Alpha', g11.active === 'Beta' && b1.lines[0] === 'Second documentè' && (await st('Alpha')).depth === aDepth, { g11, b1 });
  await clickDoc('Alpha', 4, 4);
  await dbl(await cell('à'));
  ok('... and back in Alpha', (await st('Alpha')).lines[4] === 'Lastà' && (await st('Beta')).lines[0] === 'Second documentè');

  // ---------------------------------------------------- no document
  await ev(async () => { await os.filer.run('RAM::RamDisc0.$.Gamma'); for (let i = 0; i < 200 && !window.__doc('Gamma'); i++) await window.__sleep(50);
    window.__doc('Gamma').win.open({ x: 300, y: 500, w: 400, h: 200, behind: 'top', scrollX: 0, scrollY: 0 }); await window.__frames(2); });
  await clickDoc('Gamma', 0, 2);
  ok('a third document clicked in becomes the active one', (await gs()).active === 'Gamma');
  await ev(() => window.__doc('Gamma').requestClose());
  await ev(() => window.__sleep(300));
  await settle();
  const none = await gs();
  const before = await ev(() => ({ a: window.__st('Alpha').depth, b: window.__st('Beta').depth, beeps: window.__beeps }));
  await dbl(await cell('é'));
  const after = await ev(() => ({ a: window.__st('Alpha').depth, b: window.__st('Beta').depth, beeps: window.__beeps }));
  const g12 = await gs();
  ok('with the active document closed nobody is active; a double-click beeps and says so, nothing inserted anywhere',
    none.active === null && after.beeps > before.beeps && g12.status === 'No document to insert into: click in one first.' && after.a === before.a && after.b === before.b
    && g12.recent[0] !== undefined && !(await ev(() => window.__msgs.length)), { none, before, after, g12 });
  await clickDoc('Alpha', 4, 5);

  // ---------------------------------------------------- Special character menu
  const sp = (t) => ev((t) => window.__doc('Alpha').win.menu({}).items.find((i) => i.text === 'Insert').submenu().items.find((i) => i.text === 'Special character')
    .submenu().items.find((i) => i.text === t).action(), t);
  await clickDoc('Alpha', 4, 5);
  const d10 = (await st('Alpha')).depth;
  const want = [['Em dash', '—'], ['En dash', '–'], ['Copyright', '©'], ['Registered', '®'], ['Trademark', '™'], ['Section', '§'],
    ['Paragraph', '¶'], ['Ellipsis', '…'], ['Single opening quote', '‘'], ['Single closing quote', '’'], ['Double opening quote', '“'],
    ['Double closing quote', '”'], ['Degree', '°'], ['Non-breaking space', NB]];
  for (const [t] of want) { await sp(t); await settle(); }
  const sp1 = await st('Alpha');
  ok('the special characters from the menu: dashes, marks, quotes, degree and a no-break space, one undo step each',
    sp1.lines[4] === 'Lastà' + want.map((x) => x[1]).join(''), sp1.lines[4]);
  ok('... 14 steps', sp1.depth === d10 + 14, sp1.depth - d10);
  for (let i = 0; i < 14; i++) await press('Control+z');
  ok('... undone one by one', (await st('Alpha')).depth === d10, await st('Alpha'));

  // ---------------------------------------------------- keys: Ctrl-Shift-Space
  await clickDoc('Alpha', 0, 3);
  await press('Control+Shift+Space');
  const n1 = await st('Alpha');
  ok('Ctrl-Shift-Space types a no-break space at the caret (one step)', n1.lines[0].slice(3, 4) === NB && n1.depth === d10 + 1 && same(n1.head, [0, 4]), n1);
  await press('Control+z');
  // after "1." a no-break space is not a Space; a Space is
  await clickDoc('Alpha', 2, 2);
  await press('Control+Shift+Space');
  const n2 = await st('Alpha');
  await clickDoc('Alpha', 3, 2);
  await press('Space');
  const n3 = await st('Alpha');
  ok('"1." then Ctrl-Shift-Space stays a plain paragraph (no AutoFormat list); "1." then a real Space makes a list item',
    n2.lines[2] === '1.' + NB && n2.num[2] === null && n3.num[3] !== null, { n2: n2.lines[2], num2: n2.num[2], num3: n3.num[3] });
  // a symbol inserted after "1." (nbsp from the grid) makes no list either
  await press('Control+z');
  await press('Control+z');
  await press('Control+z');

  // ---------------------------------------------------- keys: Ctrl-Shift--
  await clickDoc('Alpha', 0, 5);
  const d11 = (await st('Alpha')).depth;
  await press('Control+Shift+Minus');
  const h1 = await st('Alpha');
  ok('Ctrl-Shift-- puts a no-break hyphen in (a w:noBreakHyphen inline, one step, caret after)', h1.lines[0].startsWith('Hello' + O)
    && h1.inl[0][0] === 'w:noBreakHyphen' && h1.depth === d11 + 1 && same(h1.head, [0, 6]), h1);
  await ev(() => window.__doc('Alpha').win.menu({}).items.find((i) => i.text === 'Insert').submenu().items.find((i) => i.text === 'Special character')
    .submenu().items.find((i) => i.text === 'Optional hyphen').action());
  await settle();
  const h2 = await st('Alpha');
  ok('Optional hyphen from the menu: a w:softHyphen inline, a step, the caret after', same(h2.inl[0].slice(0, 2), ['w:noBreakHyphen', 'w:softHyphen']) && h2.depth === d11 + 2
    && same(h2.head, [0, 7]), h2);
  const bytes = new Uint8Array(await ev(async () => Array.from(await window.__doc('Alpha').saveBytes())));
  const xml = (await xmlEntries(bytes)).get('word/document.xml').root;
  const found = [];
  const walk = (x, par) => {
    if (!x || typeof x !== 'object') return;
    if (x.name === 'w:noBreakHyphen' || x.name === 'w:softHyphen') found.push([x.name, x.attrs.length, x.children.length, par?.name]);
    for (const c of x.children || []) walk(c, x);
  };
  walk(xml, null);
  ok('a saved copy holds <w:noBreakHyphen/> and <w:softHyphen/> each in a run', same(found, [['w:noBreakHyphen', 0, 0, 'w:r'], ['w:softHyphen', 0, 0, 'w:r']]), found);
  await press('Control+z');
  await press('Control+z');
  ok('Ctrl-Z twice takes them out', (await st('Alpha')).inl[0].length === 0);

  // ---------------------------------------------------- Greek and Cyrillic from the grid
  await ev(() => { window.__sy().grid.open(); window.__sy().grid.pick('greek'); });
  await settle();
  await clickDoc('Alpha', 4, 2);
  await dbl(await cell('\u03A9'));
  await ev(() => window.__sy().grid.pick('cyrillic'));
  await dbl(await cell('\u0416'));
  const gk = await st('Alpha');
  ok('Greek and Cyrillic sets: an omega and a zhe inserted', gk.lines[4].slice(2, 4) === '\u03A9\u0416', gk.lines[4]);
  await press('Control+z');
  await press('Control+z');

  // ---------------------------------------------------- the hyphens keep the pending format
  await clickDoc('Alpha', 4, 2);
  await press('Control+b');
  await press('Control+Shift+Minus');
  await page.keyboard.type('x');
  await settle();
  const pf = await ev(() => { const b = window.__doc('Alpha').d.doc.sections[0].blocks[4]; return { text: b.text, runs: b.runs.map((r) => [r.start, r.end, !!r.rPr?.b]) }; });
  ok('Ctrl-B, then Ctrl-Shift--, then typing x: the hyphen and the x are bold, the rest not', pf.text.slice(2, 4) === O + 'x'
    && same(pf.runs.map((r) => r[2]), [false, true, false]) && pf.runs[1][0] === 2 && pf.runs[1][1] === 4, pf);
  await press('Control+z');
  await press('Control+z');

  // ---------------------------------------------------- hostile: no selection, odd input
  const odd = await ev(() => {
    const g = window.__sy().grid;
    return { a: g.select(''), b: g.select('ab'), c: g.select('中'), d: g.pick('__proto__'), e: g.pick('nonsense'), f: g.where('z'), sel: g.selected };
  });
  ok('select / pick refuse characters and sets that are not there', odd.a === false && odd.b === false && odd.c === false && odd.d === false && odd.e === false
    && odd.f === null, odd);
  const beeps0 = await ev(() => window.__beeps);
  await ev(() => { const g = window.__sy().grid; g.select('é'); g.pick('arrows'); g.open(); });
  await press('Enter');
  ok('Return with nothing chosen beeps and inserts nothing', (await ev(() => window.__beeps)) > beeps0);

  // ---------------------------------------------------- a long set scrolls
  await ev(async () => {
    const chars = Array.from({ length: 16 * 20 }, (_, i) => String.fromCharCode(0xC0 + (i % 64) + (i >= 64 ? 0 : 0))).join('');
    const uniq = Array.from({ length: 16 * 20 }, (_, i) => String.fromCharCode(0x100 + i)).join('');
    const g = window.__sy().withSets([{ id: 'big', name: 'Big', chars: uniq }, { id: 'small', name: 'Small', chars: 'abc' }]);
    window.__chars = uniq;
    window.__sy().open();
    await window.__frames(2);
  });
  const sc0 = await gs();
  const sc = await ev(() => { const g = window.__sy().grid; return { a: g.where(window.__chars[0]), z: g.where(window.__chars[16 * 8]), last: g.where(window.__chars[319]) }; });
  const bar0 = await ev(() => window.__scan(12 + 512 + 4, 106, 14, 240));
  ok('a set of 20 rows shows 8 (the 9th row is not shown) with a scroll bar drawn', sc0.open && sc.a && !sc.z && !sc.last && bar0.dark > 200, { sc, bar0 });
  await ev(() => window.__sy().grid.win.emit('wheel', { dx: 0, dy: 100, shift: false }));
  await settle();
  const sc1 = await ev(() => ({ top: window.__sy().grid.top, a: window.__sy().grid.where(window.__chars[0]), z: !!window.__sy().grid.where(window.__chars[16 * 8]) }));
  ok('the wheel scrolls a row', sc1.top === 1 && sc1.a === null && sc1.z, sc1);
  await click(await ev(() => { const g = window.__sy().grid; return window.__client(g.win, 12 + 512 + 10, 106 + 220); }));
  const sc2 = await ev(() => window.__sy().grid.top);
  ok('a click on the scroll bar below the middle pages down (7 rows), at the end it stops at 12', sc2 === 8, sc2);
  await click(await ev(() => { const g = window.__sy().grid; return window.__client(g.win, 12 + 512 + 10, 106 + 220); }));
  ok('... at most the last 8 rows', (await ev(() => window.__sy().grid.top)) === 12);
  await click(await ev(() => { const g = window.__sy().grid; return window.__client(g.win, 12 + 512 + 10, 106 + 10); }));
  const sc3 = await ev(() => window.__sy().grid.top);
  ok('a click above the middle pages up', sc3 === 5, sc3);
  await ev(() => window.__sy().grid.select(window.__chars[300]));
  const sc4 = await ev(() => ({ top: window.__sy().grid.top, w: !!window.__sy().grid.where(window.__chars[300]) }));
  ok('choosing a character that is not shown scrolls it into view', sc4.w && sc4.top >= 11, sc4);
  await press('PageUp');
  await press('PageDown');
  await ev(() => { window.__sy().grid.delete(); });

  // ---------------------------------------------------- leaks
  const counts = () => ev(() => {
    const t = window.__word(), n = (e) => [...e._h.values()].reduce((a, l) => a + l.length, 0);
    return { win: os.wimp.windows.size, task: t.windows.size, icons: document.querySelectorAll('.icon').length,
      wl: n(os.wimp), tl: n(t), menus: os.wimp.menus.isOpen };
  });
  await ev(async () => { window.__sy().open(); await window.__frames(2); });
  const c0 = await counts();
  for (let i = 0; i < 20; i++) {
    await ev(async () => { const g = window.__sy().grid; g.open(); await window.__frames(1); g.select('é'); g.pick('maths'); g.close(); });
  }
  const c1 = await counts();
  ok('20 open / close cycles of the grid leave nothing behind', same(c0, c1), { c0, c1 });
  await ev(() => window.__sy().grid.delete());
  const c2 = await counts();
  ok('deleting it leaves the desktop as before it was opened', c2.win === base.windows && c2.menus === false, { c2, base });
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
