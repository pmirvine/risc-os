// !Word's Tabs dialogue box in the real desktop (Format > Tabs..., and
// the Tabs... button of the Paragraph box), with real clicks and keys:
// the box shows the paragraph's stops (a popup) and the document's
// default stop; changing the default from 0.5" to 1" moves the default
// tabs on screen and the grey default marks on the ruler, and Ctrl-Z
// moves them back (the old settings root again); Set (position,
// alignment, leader), Clear and Clear all only change the document at
// OK, one undo step with the default; picking a stop from the popup
// fills the fields; bad positions, a default of 0, a paragraph whose
// stops are kept raw beep and change nothing; a selection or document
// changed while the box was open beeps at OK and refills it; a
// document with no settings part shows 0.5" shaded; one box per
// document, deleted with it; 20 open / close cycles leave nothing
// behind. No page errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, settingsXml, p } from './build-docx.mjs';

const tabbed = (...parts) => `<w:r>${parts.map((t, i) => (i ? '<w:tab/>' : '') + `<w:t>${t}</w:t>`).join('')}</w:r>`;
const raw = `<w:tabs>${Array.from({ length: 257 }, (_, k) => `<w:tab w:val="left" w:pos="${20 * (k + 1)}"/>`).join('')}</w:tabs>`;
const body = () => [p(tabbed('A', 'B', 'C')), p(tabbed('Second', 'line')), p(tabbed('Raw', 'stops'), raw),
  p('<w:r><w:t>Plain paragraph.</w:t></w:r>')].join('');
const docx = async (settings) => Array.from(await buildDocx({ 'word/document.xml': documentXml(body()),
  ...(settings ? { 'word/settings.xml': settingsXml('<w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/>'
    + '<w:characterSpacingControl w:val="doNotCompress"/>') } : {}) }));
const files = { Ta: await docx(true), Tn: await docx(false) };

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + String(JSON.stringify(detail)).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); await settle(); };
const click = async (q, opts) => { await page.mouse.click(q.x, q.y, opts); await wait(60); await settle(); };

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
    window.__doc = (leaf = 'Ta') => window.__word()?.word.docs.find((d) => d.path.endsWith('.' + leaf));
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__point = (i, off, leaf = 'Ta') => {
      const d = window.__doc(leaf), L = d.view.layout, c = L.caretRect({ id: L.items[i].id, off });
      return window.__client(d.win, c.x + 1, c.y + c.h / 2);
    };
    /** Layout px from paragraph i's start to the caret place at off (the text after its tabs). */
    window.__x = (i, off, leaf = 'Ta') => {
      const L = window.__doc(leaf).view.layout, id = L.items[i].id;
      return L.caretRect({ id, off }).x - L.caretRect({ id, off: 0 }).x;
    };
    window.__box = (leaf = 'Ta') => {
      const d = window.__doc(leaf);
      return d && d.dw.boxes.has('tabs') ? window.__word().word.dialog({ key: 'tabs:' + d.docKey, rows: [] }) : null;
    };
    window.__pbox = (leaf = 'Ta') => {
      const d = window.__doc(leaf);
      return d && d.dw.boxes.has('para') ? window.__word().word.dialog({ key: 'para:' + d.docKey, rows: [] }) : null;
    };
    window.__icon = (name, leaf = 'Ta', which = '__box') => {
      const w = window[which](leaf).win, b = w.iconByName(name).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    window.__tabs = (i, leaf = 'Ta') => window.__doc(leaf).d.doc.sections[0].blocks[i].pPr?.tabs;
    window.__state = (leaf = 'Ta') => {
      const d = window.__doc(leaf);
      return { depth: d.view.undoDepth, title: d.win.title, caret: os.wimp.caret?.window === d.win, msgs: window.__msgs.length,
        beeps: window.__beeps };
    };
    window.__ticks = (leaf = 'Ta') => [...(window.__doc(leaf).ruler.scale?.ticks || [])];
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    for (const [leaf, x] of [['Ta', 40], ['Tn', 260]]) {
      await os.filer.run('RAM::RamDisc0.$.' + leaf);
      for (let i = 0; i < 100 && !window.__doc(leaf); i++) await window.__sleep(50);
      window.__doc(leaf).win.open({ x, y: 40, w: 700, h: 420, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(3);
    }
    return { ok: !!window.__doc('Ta') && !!window.__doc('Tn'), msgs: window.__msgs };
  }, files);
  ok('two documents open', s0.ok && !s0.msgs.length, s0);

  const pick = async (level, text, { hover = false } = {}) => {
    const item = page.locator('.menu').nth(level).locator('.mitem', { hasText: new RegExp('^' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
    const b = await item.boundingBox();
    if (!b) throw new Error(`no menu item '${text}' at level ${level}`);
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
  const winMenu = async (leaf = 'Ta') => {
    const ic = await ev((l) => { const rc = window.__doc(l).toolbar2.icon('lineSpacing').el.getBoundingClientRect(); return { x: rc.left + 4, y: rc.top + 4 }; }, leaf);
    await click(ic, { button: 'middle' });
    await wait(200);
  };
  const openBox = async (leaf = 'Ta', item = 'Tabs...') => {
    await winMenu(leaf);
    await pick(0, 'Format', { hover: true });
    await pick(1, item);
    await wait(100);
    await settle();
  };
  const icon = (name, leaf = 'Ta', which = '__box') => ev(([n, l, w]) => window.__icon(n, l, w), [name, leaf, which]);
  const field = async (name, text, leaf = 'Ta') => {
    await click(await icon(name, leaf));
    await press('End');
    await press('Backspace', 24);
    if (text) { await page.keyboard.type(text); await settle(); }
  };
  const vals = (leaf = 'Ta') => ev((l) => window.__box(l).values(), leaf);
  const popupText = (leaf = 'Ta') => ev((l) => window.__box(l).win.iconByName('stops').text, leaf);
  const counts = () => ev(() => {
    const t = window.__word(), n = (e) => [...e._h.values()].reduce((a, l) => a + l.length, 0);
    return { win: os.wimp.windows.size, task: t.windows.size, icons: document.querySelectorAll('.icon').length,
      wl: n(os.wimp), tl: n(t), menus: os.wimp.menus.isOpen, stack: os.wimp.stack.length };
  });

  // ---------------------------------------------------- the box: what it shows
  await click(await ev(() => window.__point(0, 0)));
  const st0 = await ev(() => window.__state());
  const x0 = await ev(() => ({ b: window.__x(0, 2), c: window.__x(0, 4), ticks: window.__ticks() }));
  ok('to start: default stops every 0.5" (B at 48 px, C at 96 px); the ruler marks 720, 1440...', x0.b === 48 && x0.c === 96
    && same(x0.ticks.slice(0, 3), [720, 1440, 2160]), x0);
  await openBox();
  const b1 = await ev(() => { const b = window.__box(); return b && { open: b.isOpen, title: b.win.title, v: b.values(),
    shaded: b.win.iconByName('deftab').shaded, front: os.wimp.stack.at(-1) === b.win }; });
  ok('Format > Tabs... opens the box at the front: Default 0.5" (not shaded), no position, Left, None, no stops',
    b1 && b1.open && b1.title === 'Tabs' && b1.v.deftab === 720 && !b1.shaded && b1.v.pos === undefined && b1.v.align === 'left'
    && b1.v.leader === 'none' && b1.front, b1);
  ok('... the popup says (none)', (await popupText()) === '(none)');

  // ---------------------------------------------------- the default 0.5" -> 1": on screen and on the ruler; undo
  const old = await ev(() => { window.__oldSettings = window.__doc().d.doc.rawSettings; return true; });
  await field('deftab', '1');
  await click(await icon('button:OK'));
  const d1 = await ev(() => ({ b: window.__x(0, 2), c: window.__x(0, 4), b2: window.__x(1, 7), ticks: window.__ticks(),
    s: window.__state(), gone: !window.__box(), changed: window.__doc().d.doc.rawSettings !== window.__oldSettings }));
  ok('Default 1" + OK: the default tabs move (B at 96 px, C at 192 px, the next line too), one undo step, the star, the box gone',
    old && d1.b === 96 && d1.c === 192 && d1.b2 === 96 && d1.s.depth === st0.depth + 1 && d1.s.title.endsWith(' *') && d1.gone
    && d1.s.caret && d1.changed, d1);
  ok('... the ruler\'s default marks every inch now', same(d1.ticks.slice(0, 3), [1440, 2880, 4320]), d1.ticks);
  await press('Control+z');
  const u1 = await ev(() => ({ b: window.__x(0, 2), ticks: window.__ticks(), s: window.__state(),
    back: window.__doc().d.doc.rawSettings === window.__oldSettings }));
  ok('Ctrl-Z moves them back on screen and on the ruler (the old settings root)', u1.b === 48 && u1.back
    && same(u1.ticks.slice(0, 2), [720, 1440]) && u1.s.depth === st0.depth, u1);
  await openBox();
  ok('... and the box shows 0.5" again', (await vals()).deftab === 720);
  await press('Escape');

  // ---------------------------------------------------- Set: two stops, OK once
  await openBox();
  await field('pos', '2');
  await click(await icon('kright'));
  await click(await icon('ldot'));
  await click(await icon('set'));
  const s1 = await ev(() => ({ v: window.__box().values(), t: window.__box().win.iconByName('stops').text,
    tabs: window.__tabs(0), open: window.__box().isOpen }));
  ok('Set (2", Right, Dots): listed in the popup, the box open, the document not changed yet', s1.open
    && s1.t === '2" Right, dots' && s1.tabs === undefined, s1);
  await field('pos', '1');
  await click(await icon('kcenter'));
  await click(await icon('lnone'));
  await click(await icon('set'));
  const before = await ev(() => window.__state().depth);
  await click(await icon('button:OK'));
  const o1 = await ev(() => ({ tabs: window.__tabs(0), other: window.__tabs(1), s: window.__state(), b: window.__x(0, 2),
    c: window.__x(0, 4), ticks: window.__ticks(), marks: window.__doc().ruler.markers.filter((m) => m.kind.startsWith('tab'))
      .map((m) => [m.kind, m.twips]) }));
  ok('OK: the paragraph has centre 1" and right 2" with dots, ONE undo step; the other paragraphs untouched',
    same(o1.tabs, [{ val: 'center', pos: 1440 }, { val: 'right', pos: 2880, leader: 'dot' }]) && o1.other === undefined
    && o1.s.depth === before + 1, o1);
  ok('... on the ruler: the two stops, the default marks only past the last one', same(o1.marks, [['tabC', 1440], ['tabR', 2880]])
    && o1.ticks[0] === 3600, o1);
  ok('... on screen: B centred on 1" and C ending at 2"', Math.abs(o1.b - 96) < 8 && o1.c > 96 && o1.c < 192, o1);

  // ---------------------------------------------------- a stop picked from the popup fills the fields; Clear
  await openBox();
  await click(await icon('arrow:stops'));
  await wait(150);
  await pick(0, '2" Right');
  const pk = await vals();
  ok('picking 2" Right from the popup: the position 2", Right, Dots', pk.pos === 2880 && pk.align === 'right' && pk.leader === 'dot', pk);
  await click(await icon('clear'));
  const cl = await ev(() => ({ v: window.__box().values(), cleared: window.__box().win.iconByName('cleared').text }));
  ok('Clear: the position emptied, 2" to be cleared', cl.v.pos === undefined && cl.cleared === '2"', cl);
  await click(await icon('button:Cancel'));
  ok('Cancel: nothing changed', same(await ev(() => window.__tabs(0)), o1.tabs) && (await ev(() => window.__state().depth)) === o1.s.depth);

  // ---------------------------------------------------- Clear all + a default together: one undo step
  await openBox();
  await click(await icon('clearall'));
  ok('Clear all: All to be cleared, the popup empty', (await ev(() => window.__box().win.iconByName('cleared').text)) === 'All'
    && (await popupText()) === '(none)');
  await field('deftab', '0.25');
  const d2 = await ev(() => window.__state().depth);
  await press('Enter');
  const o2 = await ev(() => ({ tabs: window.__tabs(0), s: window.__state(), b: window.__x(0, 2), ticks: window.__ticks() }));
  ok('Return: the stops gone and the default 0.25" (B at 24 px, marks every 360), ONE undo step', o2.tabs === undefined
    && o2.b === 24 && same(o2.ticks.slice(0, 2), [360, 720]) && o2.s.depth === d2 + 1, o2);
  await press('Control+z');
  const u2 = await ev(() => ({ tabs: window.__tabs(0), b: window.__x(0, 2), ticks: window.__ticks() }));
  ok('one Ctrl-Z gives back both: the stops and the 0.5" default', same(u2.tabs, o1.tabs) && u2.ticks[0] === 3600, u2);

  // ---------------------------------------------------- refused: beeps, nothing changed
  await openBox();
  const z = await ev(() => window.__state());
  await field('pos', 'abc');
  await click(await icon('set'));
  await field('pos', '23');
  await click(await icon('set'));
  await field('pos', '5');
  await click(await icon('clear'));
  await field('pos', '');
  await field('deftab', '0');
  await click(await icon('button:OK'));
  const r1 = await ev(() => ({ s: window.__state(), open: !!window.__box() && window.__box().isOpen, t: window.__box().win.iconByName('stops').text }));
  ok('a position that is not a length, 23", Clear where there is no stop, a default of 0: four beeps, the box kept, nothing changed',
    r1.s.beeps === z.beeps + 4 && r1.open && r1.s.depth === z.depth && r1.t === '', { r1, z });
  await press('Escape');
  ok('Escape: the box goes, nothing changed', !(await ev(() => window.__box())) && (await ev(() => window.__state().depth)) === z.depth);

  // ---------------------------------------------------- stops kept raw: refused with a beep
  await click(await ev(() => window.__point(2, 1)));
  await openBox();
  const rw = await ev(() => window.__state());
  await click(await icon('arrow:stops'));
  await wait(150);
  await pick(0, '0.01"');
  const n0 = (await vals()).stops;
  await field('pos', '1');
  await click(await icon('set'));
  await click(await icon('clearall'));
  await click(await icon('button:OK'));
  const r2 = await ev(() => ({ s: window.__state(), open: !!window.__box(), raw: !!window.__doc().d.doc.sections[0].blocks[2].pPr.extra.length,
    tabs: window.__tabs(2) }));
  ok('a paragraph whose stops are kept raw (257): Set, Clear all and OK with a position beep; nothing written',
    r2.s.beeps === rw.beeps + 3 && r2.open && r2.raw && r2.tabs === undefined && r2.s.depth === rw.depth && n0 === 'p20', { r2, rw, n0 });
  await field('pos', '');
  await field('deftab', '1');
  await click(await icon('button:OK'));
  const r3 = await ev(() => ({ s: window.__state(), b: window.__x(0, 2) }));
  ok('... the default alone still goes in (one step)', r3.s.depth === rw.depth + 1 && !(await ev(() => window.__box())), r3);
  await press('Control+z');

  // ---------------------------------------------------- the document changed while the box was open
  await click(await ev(() => window.__point(1, 0)));
  await openBox();
  await ev(() => window.__doc().view.format('tabs', { add: { val: 'left', pos: 4320 } }));
  await settle();
  const sg = await ev(() => window.__state());
  await field('deftab', '2');
  await click(await icon('button:OK'));
  const r4 = await ev(() => ({ s: window.__state(), open: !!window.__box() && window.__box().isOpen, v: window.__box().values(),
    t: window.__box().win.iconByName('stops').text }));
  ok('the document changed while the box was open: OK beeps, the box filled again (3" listed, 0.5" back) and kept',
    r4.s.beeps === sg.beeps + 1 && r4.open && r4.s.depth === sg.depth && r4.v.deftab === 720, r4);
  await click(await icon('arrow:stops'));
  await wait(150);
  await pick(0, '3" Left');
  ok('... its popup lists the new stop', (await vals()).pos === 4320);
  await press('Escape');
  await press('Control+z');

  // ---------------------------------------------------- the Paragraph box's Tabs... button
  await openBox('Ta', 'Paragraph...');
  await click(await icon('tabs', 'Ta', '__pbox'));
  const pb = await ev(() => { const bx = window.__doc().dw.boxes; const t = bx.get('tabs'), pa = bx.get('para');
    return { tabs: !!t && t.isOpen, para: !!pa && pa.isOpen, front: os.wimp.stack.at(-1) === t }; });
  ok('Paragraph... > Tabs...: the Tabs box opens in front, the Paragraph box stays', pb.tabs && pb.para && pb.front, pb);
  await press('Escape');
  await ev(() => window.__pbox()?.delete());
  await settle();
  // its own Tabs box's OK does not make the Paragraph box's OK stale
  await click(await ev(() => window.__point(0, 1)));
  await openBox('Ta', 'Paragraph...');
  await click(await icon('tabs', 'Ta', '__pbox'));
  await field('pos', '3');
  const sp0 = await ev(() => window.__state());
  await press('Enter');
  await click(await icon('keepnext', 'Ta', '__pbox'));
  await click(await icon('button:OK', 'Ta', '__pbox'));
  const sp1 = await ev(() => ({ s: window.__state(), p: !!window.__pbox() && window.__pbox().isOpen,
    tabs: window.__tabs(0), kn: window.__doc().d.doc.sections[0].blocks[0].pPr?.keepNext }));
  ok('Paragraph... > Tabs..., a stop set with OK, then the Paragraph box\'s OK: no beep, both applied (two steps), the box gone',
    sp1.s.beeps === sp0.beeps && sp1.s.depth === sp0.depth + 2 && !sp1.p && sp1.kn === true
    && (sp1.tabs || []).some((t) => t.pos === 4320), { sp0, sp1 });
  await press('Control+z');
  await press('Control+z');
  // a change made elsewhere (the ruler, a key) while it is open: stale
  await openBox('Ta', 'Paragraph...');
  await ev(() => window.__doc().view.format('tabs', { add: { val: 'left', pos: 5760 } }));
  await settle();
  const sq0 = await ev(() => window.__state());
  await click(await icon('keepnext', 'Ta', '__pbox'));
  await click(await icon('button:OK', 'Ta', '__pbox'));
  const sq1 = await ev(() => ({ s: window.__state(), p: !!window.__pbox() && window.__pbox().isOpen,
    kn: window.__doc().d.doc.sections[0].blocks[0].pPr?.keepNext, v: window.__pbox()?.values().keepnext }));
  ok('... a tab stop set by another command while the Paragraph box is open: its OK beeps, writes nothing and fills the box again',
    sq1.s.beeps === sq0.beeps + 1 && sq1.s.depth === sq0.depth && sq1.p && sq1.kn !== true && sq1.v === false, { sq0, sq1 });
  await press('Escape');
  await press('Control+z');
  await ev(() => window.__pbox()?.delete());
  await settle();

  // ---------------------------------------------------- a document with no settings part
  await ev(() => window.__doc('Tn').dw.view.focus());
  await click(await ev(() => window.__point(0, 0, 'Tn')));
  await openBox('Tn');
  const nn = await ev(() => { const b = window.__box('Tn'); return { v: b.values(), shaded: b.win.iconByName('deftab').shaded }; });
  ok('no settings part: 0.5" shown, the field shaded', nn.v.deftab === 720 && nn.shaded, nn);
  await field('pos', '1.5', 'Tn');
  await press('Enter');
  ok('... stops still set (Return sets the position typed)', same(await ev(() => window.__tabs(0, 'Tn')), [{ val: 'left', pos: 2160 }])
    && !(await ev(() => window.__doc('Tn').d.doc.rawSettings)));

  // ---------------------------------------------------- one box per document; deleted with it
  await ev(() => window.__doc('Ta').dw.view.focus());
  await click(await ev(() => window.__point(0, 0)));
  await openBox('Ta');
  await ev(() => window.__doc('Tn').dw.view.focus());
  await openBox('Tn');
  const two = await ev(() => ({ a: window.__box('Ta'), b: window.__box('Tn') }));
  ok('two documents, two boxes (tabs:<docKey>)', !!two.a && !!two.b && (await ev(() => window.__box('Ta') !== window.__box('Tn'))));
  await press('Escape');
  const pre = await counts();
  const closed = await ev(async () => {
    const bx = window.__box('Ta'), w = bx.win;
    window.__doc('Ta').dw.close();
    await window.__frames(3);
    return { docs: window.__word().word.docs.length, gone: bx.gone, inWimp: [...os.wimp.windows].includes(w) };
  });
  const post = await counts();
  ok('closing a document deletes its Tabs box', closed.docs === 1 && closed.gone && !closed.inWimp && post.win < pre.win
    && post.wl <= pre.wl && post.tl <= pre.tl, { closed, pre, post });

  // ---------------------------------------------------- leaks: 20 cycles
  await ev(() => window.__doc('Tn').dw.view.focus());
  await click(await ev(() => window.__point(1, 0, 'Tn')));
  const base = await counts();
  for (let i = 0; i < 20; i++) {
    await openBox('Tn');
    const how = i % 3;
    if (how === 0) {
      await click(await ev(() => window.__icon('clearall', 'Tn')));
      await press('Enter');
    } else if (how === 1) await press('Escape');
    else await click(await ev(() => window.__icon('button:Cancel', 'Tn')));
  }
  await ev(() => window.__frames(4));
  const end = await counts();
  ok('20 open / close cycles (Clear all + Return, Escape, Cancel): no windows, icons, listeners or menus left',
    end.win === base.win && end.task === base.task && end.icons === base.icons && end.wl === base.wl && end.tl === base.tl
    && !end.menus && end.stack === base.stack, { base, end });
  ok('no errors reported', !(await ev(() => window.__msgs.length)));
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
