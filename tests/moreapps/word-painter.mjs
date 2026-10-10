// !Word's format painter in the real desktop (./PaintBind,
// ./FormatPaint), with real clicks, drags and keys: the toolbar's
// row 2 Format painter button (Select: once, Adjust (Shift-click in
// this mapping): sticky until Escape or another click on the button),
// the caret picking the character format at the caret and the
// paragraph's format, a selection inside a paragraph only its first
// character's format, a click painting the word there, a drag painting
// the selection, a list format carried, one undo step, nothing to
// change making no step, Escape ending it without collapsing the
// selection, Format > Format painter (ticked), no leak of listeners.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { p, r } from './build-docx.mjs';
import { listDocx, item } from './list-fixtures.mjs';

const files = {
  Pt: Array.from(await listDocx([
    p(r('Alpha one', '<w:b/><w:color w:val="FF0000"/>'), '<w:jc w:val="center"/>'),
    p(r('Beta two plain')), p(r('Gamma three plain')),
    item('Delta list', 1), p(r('Epsilon four plain')), p(r('Zeta five plain')),
  ])),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(3));
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); await settle(); };
const click = async (q, opts) => { await wait(450); await page.mouse.click(q.x, q.y, opts); await wait(60); await settle(); };
const button = (opts) => ev(() => window.__icon('painter')).then((q) => click(q, opts));
const adjustButton = async () => {
  await page.keyboard.down('Shift');
  await button();
  await page.keyboard.up('Shift');
};
const drag = async (a, b) => {
  await wait(450);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
  await wait(60);
  await settle();
};
const st = () => ev(() => window.__st());
const at = (i, off) => ev(([i, off]) => window.__point(i, off), [i, off]);
const sel = (i, a, j = i, b = a) => ev(([i, a, j, b]) => window.__sel(i, a, j, b), [i, a, j, b]);
const runs = (s, i) => s.paras[i].runs;

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
    window.__doc = () => window.__word()?.word.docs.find((d) => d.path.endsWith('.Pt'));
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__point = (i, off) => {
      const d = window.__doc(), L = d.view.layout, c = L.caretRect({ id: L.items[i].id, off });
      return window.__client(d.win, c.x + 1, c.y + c.h / 2);
    };
    window.__icon = (name) => {
      const ic = window.__doc().toolbar2.icon(name), rc = ic.el.getBoundingClientRect();
      return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
    };
    window.__sel = (i, a, j, b) => {
      const d = window.__doc(), L = d.view.layout;
      d.view.setSelection({ id: L.items[i].id, off: a }, { id: L.items[j].id, off: b });
      d.dw.view.focus();
    };
    window.__st = () => {
      const d = window.__doc(), v = d.view, L = v.layout, bs = d.d.doc.sections.flatMap((s) => s.blocks);
      const q = d.painter;
      return { depth: v.undoDepth, beeps: window.__beeps, lines: v.lines(), labels: v.labels(),
        paras: bs.map((b) => ({ runs: b.runs.map((x) => [x.start, x.end, !!x.rPr?.b, x.rPr?.color ?? null]),
          jc: b.pPr.jc ?? null, numPr: b.pPr.numPr ?? null })),
        painter: q ? { sticky: q.sticky } : null, pressed: d.toolbar2.pressed('painter'),
        listeners: d.dw.view.painterListeners.length,
        head: v.selection ? [L.byId.get(v.selection.head.id).index, v.selection.head.off] : null,
        anchor: v.selection ? [L.byId.get(v.selection.anchor.id).index, v.selection.anchor.off] : null,
        menu: (() => {
          const it = d.win.menu({}).items.find((i) => i.text === 'Format').submenu().items.find((i) => i.text === 'Format painter');
          return it ? { ticked: !!(typeof it.ticked === 'function' ? it.ticked() : it.ticked), shaded: !!(typeof it.shaded === 'function' ? it.shaded() : it.shaded) } : null;
        })() };
    };
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await os.filer.run('RAM::RamDisc0.$.Pt');
    for (let i = 0; i < 200 && !window.__doc(); i++) await window.__sleep(50);
    window.__doc().win.open({ x: 40, y: 40, w: 760, h: 420, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    return { ok: !!window.__doc() && !!window.__doc().toolbar2.icon('painter'), msgs: window.__msgs };
  }, files);
  ok('the document opens; row 2 has the Format painter button', s0.ok && !s0.msgs.length, s0);

  // ---------------------------------------------------- once: a caret, then a click
  await sel(0, 2);
  const a0 = await st();
  ok('at first the painter is off: nothing pressed, the Format menu item not ticked',
    a0.painter === null && !a0.pressed && a0.menu?.ticked === false && a0.menu.shaded === false
    && same(runs(a0, 0), [[0, 9, true, 'FF0000']]) && a0.paras[0].jc === 'center', a0);
  await button();
  const a1 = await st();
  ok('a Select click on the button picks up the caret\'s format: on, once, pressed, ticked; the selection untouched',
    same(a1.painter, { sticky: false }) && a1.pressed && a1.menu.ticked && same(a1.head, [0, 2]) && a1.depth === a0.depth
    && a1.beeps === a0.beeps, a1);
  await click(await at(1, 7));          // inside "two"
  const a2 = await st();
  ok('a click in "Beta two plain" paints the word "two" (bold, red) and the paragraph (centred): one undo step; the painter is off again',
    same(runs(a2, 1), [[0, 5, false, null], [5, 8, true, 'FF0000'], [8, 14, false, null]]) && a2.paras[1].jc === 'center'
    && a2.depth === a1.depth + 1 && a2.painter === null && !a2.pressed && !a2.menu.ticked, a2);
  await press('Control+z');
  const a3 = await st();
  ok('... Ctrl-Z undoes both in one step', same(runs(a3, 1), [[0, 14, false, null]]) && a3.paras[1].jc === null
    && a3.depth === a1.depth, a3);
  await click(await at(2, 3));
  const a4 = await st();
  ok('... off now: a click does not paint', a4.depth === a3.depth && same(runs(a4, 2), [[0, 17, false, null]]), a4);

  // ---------------------------------------------------- a selection inside a paragraph: characters only; drags paint
  await sel(0, 0, 0, 5);
  await button();
  const b1 = await st();
  ok('"Alpha" selected, Select click: on', same(b1.painter, { sticky: false }) && b1.pressed, b1);
  await drag(await at(2, 2), await at(2, 9));       // from the middle of "Gamma" to the middle of "three"
  const b2 = await st();
  ok('a drag from mid-word paints exactly the dragged range (2..9) when the button is let go, not the word under the press: one step; the painter off',
    same(runs(b2, 2), [[0, 2, false, null], [2, 9, true, 'FF0000'], [9, 17, false, null]]) && b2.paras[2].jc === null
    && b2.depth === b1.depth + 1 && b2.painter === null, b2);
  ok('... the dragged selection stays', same(b2.anchor, [2, 2]) && same(b2.head, [2, 9]), b2);
  await press('Control+z');
  // sticky: a drag across paragraphs, one step, still on; a click after it paints its word
  await sel(0, 0, 0, 5);
  await adjustButton();
  await drag(await at(1, 5), await at(2, 3));
  const b3 = await st();
  ok('sticky: a drag across two paragraphs is ONE undo step, paints from the press to the release (not the word under the press), and the painter stays on',
    b3.depth === b1.depth + 1 && same(runs(b3, 1), [[0, 5, false, null], [5, 14, true, 'FF0000']])
    && same(runs(b3, 2), [[0, 3, true, 'FF0000'], [3, 17, false, null]]) && b3.painter?.sticky === true, b3);
  await click(await at(4, 3));
  const b4 = await st();
  ok('... and a click afterwards paints its word at the release (a second step)', b4.depth === b3.depth + 1
    && same(runs(b4, 4), [[0, 18, false, null]]) === false, b4);
  await press('Escape');
  await press('Control+z', 2);
  const b5 = await st();
  ok('... two Ctrl-Z take both away', b5.depth === b1.depth && same(runs(b5, 1), [[0, 14, false, null]]), b5);
  // once: a drag that returns to the press point is a click: the word
  await sel(0, 0, 0, 5);
  await button();
  await drag(await at(5, 3), await at(5, 3));
  const b6 = await st();
  ok('once: a "drag" that ends where it began paints the word (Zeta) and the painter is off',
    b6.painter === null && b6.depth === b5.depth + 1, b6);
  await press('Control+z');

  // ---------------------------------------------------- Adjust: sticky, Escape ends it
  await sel(0, 2);
  await adjustButton();
  const c1 = await st();
  ok('an Adjust click on the button: on and sticky', same(c1.painter, { sticky: true }) && c1.pressed, c1);
  await click(await at(1, 2));
  await click(await at(2, 8));
  const c2 = await st();
  ok('two clicks paint two words and it stays on (bold red "Beta" and "three")',
    c2.painter?.sticky === true && c2.pressed && c2.depth === c1.depth + 2
    && same(runs(c2, 1), [[0, 4, true, 'FF0000'], [4, 14, false, null]])
    && same(runs(c2, 2), [[0, 6, false, null], [6, 11, true, 'FF0000'], [11, 17, false, null]]), c2);
  await sel(3, 0, 3, 3);
  await press('Escape');
  const c3 = await st();
  ok('Escape ends the painter and does nothing else (the selection is not collapsed)',
    c3.painter === null && !c3.pressed && same(c3.anchor, [3, 0]) && same(c3.head, [3, 3]) && c3.depth === c2.depth, c3);
  await press('Escape');
  const c4 = await st();
  ok('... the next Escape is the ordinary one (the selection becomes a caret)', same(c4.anchor, c4.head), c4);
  await click(await at(4, 3));
  const c5 = await st();
  ok('... off: a click paints nothing', c5.depth === c2.depth, c5);
  await press('Control+z', 2);

  // ---------------------------------------------------- Adjust, then another click on the button ends it
  await sel(0, 2);
  await adjustButton();
  await button();
  const d1 = await st();
  ok('sticky, then a click on the button: off', d1.painter === null && !d1.pressed, d1);
  await adjustButton();
  await adjustButton();
  const d2 = await st();
  ok('... and Adjust again on a sticky painter turns it off too', d2.painter === null && !d2.pressed, d2);
  await button();
  await adjustButton();
  const d3 = await st();
  ok('... Adjust on a once painter makes it sticky', same(d3.painter, { sticky: true }), d3);
  await press('Escape');

  // ---------------------------------------------------- the list format is carried
  await sel(3, 2);
  await button();
  const e1 = await st();
  ok('picked from a list item', e1.painter !== null, e1);
  await click(await at(4, 8));
  const e2 = await st();
  ok('a click in "Epsilon four plain" makes it a list item (the same numPr) and paints "four"',
    e2.paras[4].numPr && e2.paras[4].numPr.numId === 1 && e2.labels[4] !== null && e2.labels[4] === e2.labels[3]
    && e2.depth === e1.depth + 1, e2);
  await press('Control+z');
  const e3 = await st();
  ok('... one Ctrl-Z takes the list format away again', e3.paras[4].numPr === null && e3.labels[4] === null, e3);
  // a plain paragraph's format over a list item takes it out of its list
  await sel(5, 1);
  await button();
  await click(await at(3, 3));
  const e4 = await st();
  ok('painting a plain paragraph over the list item takes it out of its list', e4.paras[3].numPr === null && e4.labels[3] === null, e4);
  await press('Control+z');

  // ---------------------------------------------------- nothing to change: no step
  await sel(0, 2);
  await button();
  const f0 = await st();
  await click(await at(0, 3));
  const f1 = await st();
  ok('painting a word with the format it already has: no undo step', f1.depth === f0.depth && f1.painter === null, f1);

  // ---------------------------------------------------- the Format menu
  await sel(0, 2);
  await ev(() => { window.__doc().win.menu({}).items.find((i) => i.text === 'Format').submenu().items.find((i) => i.text === 'Format painter').action(); });
  await settle();
  const g1 = await st();
  ok('Format > Format painter picks up the format (once): ticked, button pressed',
    same(g1.painter, { sticky: false }) && g1.menu.ticked && g1.pressed, g1);
  await ev(() => { window.__doc().win.menu({}).items.find((i) => i.text === 'Format').submenu().items.find((i) => i.text === 'Format painter').action(); });
  await settle();
  const g2 = await st();
  ok('... the item again turns it off', g2.painter === null && !g2.menu.ticked && !g2.pressed, g2);

  // ---------------------------------------------------- no leak of listeners
  for (let i = 0; i < 50; i++) await button();
  const h1 = await st();
  ok('50 clicks on the button leave one listener and the painter off (an even number)', h1.listeners === a0.listeners && h1.painter === null, h1);

  // ---------------------------------------------------- the window closed while the button is down
  await sel(0, 2);
  await button();
  const p0 = await at(1, 2);
  await wait(450);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await wait(60);
  const k1 = await ev(() => {
    const v = window.__doc().dw.view;
    window.__v = v;
    const armed = !!v.armed, depth = v.undoDepth;
    window.__doc().dw.close();
    return { armed, depth, after: !!v.armed, painter: v.painter };
  });
  await page.mouse.up();
  await wait(60);
  const k2 = await ev(() => ({ depth: window.__v.undoDepth, msgs: window.__msgs.slice(), doc: !!window.__doc() }));
  ok('the window closed while the painter waits for the release: disarmed and off, the release paints nothing, no error',
    k1.armed && !k1.after && k1.painter === null && k2.depth === k1.depth && !k2.doc && !k2.msgs.length, { k1, k2 });
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
