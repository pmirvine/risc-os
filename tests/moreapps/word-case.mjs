// !Word's Change case in the real desktop (./ChangeCase): Shift-F3 by
// a real key cycles capitals -> small -> Title Case on the word at the
// caret and on a selection, one undo step each (Ctrl-Z, Ctrl-Y by real
// keys); plain F3 is still Save as; the Format > Change case menu (five
// modes and Next case with its key); a bold run stays bold; nothing in
// a word means no step and no star. Needs the disc built by
// tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const BOLD = '<w:r><w:rPr><w:b/></w:rPr><w:t>Bold </w:t></w:r>' + r('plain Text');
const file = Array.from(await buildDocx({ 'word/document.xml': documentXml([p(r('the quick brown fox. it is')), p(BOLD),
  p(r('   '))].join('')) }));
const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + String(JSON.stringify(detail)).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const press = async (k) => { await page.keyboard.press(k); await settle(); };
const st = () => ev(() => window.__st());
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async (f) => {
    globalThis.__riscos.reportError = () => Promise.resolve(1);
    os.vfs.writeFile('RAM::RamDisc0.$.Case', new Uint8Array(f), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = () => window.__word()?.word.docs.find((d) => !d.closed);
    window.__st = () => {
      const d = window.__doc(), v = d.view, L = v.layout, h = v.selection?.head, a = v.selection?.anchor;
      return { lines: v.lines(), depth: v.undoDepth, dirty: v.dirty, title: d.win.title, head: h ? [L.byId.get(h.id).index, h.off] : null,
        anchor: a ? [L.byId.get(a.id).index, a.off] : null,
        bold: d.d.doc.sections[0].blocks[1].runs.map((x) => [x.start, x.end, !!x.rPr?.b]) };
    };
    window.__point = (i, off) => {
      const d = window.__doc(), L = d.view.layout, c = L.caretRect({ id: L.items[i].id, off });
      const s = d.win.workToScreen(c.x + 1, c.y + c.h / 2), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__sel = (i, o, j = i, o2 = o) => {
      const d = window.__doc(), L = d.view.layout;
      d.view.setSelection({ id: L.items[i].id, off: o }, { id: L.items[j].id, off: o2 });
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await os.filer.run('RAM::RamDisc0.$.Case');
    for (let i = 0; i < 200 && !window.__doc(); i++) await window.__sleep(50);
    window.__doc().win.open({ x: 30, y: 40, w: 640, h: 400, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
  }, file);
  const q = await ev(() => window.__point(0, 6));
  await page.mouse.click(q.x, q.y);
  await wait(80);
  await settle();
  const s0 = await st();
  ok('a click puts the caret in "quick"', same(s0.head, [0, 6]) && s0.depth === 0, s0);

  await press('Shift+F3');
  const a1 = await st();
  ok('Shift-F3 makes the word at the caret (small now) Title Case (one step, the caret stays, marked changed)', a1.lines[0] === 'the Quick brown fox. it is'
    && a1.depth === 1 && same(a1.head, [0, 6]) && a1.dirty, a1);
  await press('Shift+F3');
  const a2 = await st();
  await press('Shift+F3');
  const a3 = await st();
  await press('Shift+F3');
  ok('... again: CAPITALS, small, Title Case (the cycle: capitals -> small -> Title)', a2.lines[0] === 'the QUICK brown fox. it is' && a3.lines[0] === 'the quick brown fox. it is'
    && (await st()).lines[0] === 'the Quick brown fox. it is' && (await st()).depth === 4, { a2: a2.lines[0], a3: a3.lines[0] });
  await press('Control+z');
  ok('Ctrl-Z undoes one change', (await st()).lines[0] === 'the quick brown fox. it is');
  await press('Control+y');
  ok('Ctrl-Y puts it back', (await st()).lines[0] === 'the Quick brown fox. it is');
  await press('F3');
  const sv = await ev(() => os.wimp.menus.isOpen || [...os.wimp.windows].some((w) => w.isOpen && /Save/i.test(w.title || '')));
  ok('plain F3 is still Save as, not a case change', (await st()).lines[0] === 'the Quick brown fox. it is' && sv, sv);
  await press('Escape');
  await ev(() => os.wimp.menus.close());

  // a selection, over two paragraphs, a bold run stays bold
  await ev(() => { window.__doc().dw.view.focus(); window.__sel(0, 0, 1, 15); });
  await settle();
  const d0 = (await st()).depth;
  await press('Shift+F3');
  const b1 = await st();
  ok('on a selection over two paragraphs: capitals, one step, the selection kept, the bold run still bold',
    b1.lines[0] === 'THE QUICK BROWN FOX. IT IS' && b1.lines[1] === 'BOLD PLAIN TEXT' && b1.depth === d0 + 1 && same(b1.anchor, [0, 0]) && same(b1.head, [1, 15])
    && same(b1.bold, [[0, 5, true], [5, 15, false]]), b1);

  // the menu
  const mn = await ev(() => {
    const d = window.__doc(), val = (x) => (typeof x === 'function' ? x() : x);
    const fm = d.win.menu({}).items.find((i) => i.text === 'Format').submenu();
    const cm = fm.items.find((i) => i.text === 'Change case');
    const sub = cm.submenu();
    return { top: fm.items.map((i) => i.text).slice(8, 12), items: sub.items.map((i) => [i.text, i.key ?? null, !!val(i.shaded)]), help: !!cm.help };
  });
  ok('Format > Change case > has the five modes and Next case with Shift+F3', same(mn.items.map((x) => x[0]), ['Sentence case', 'lowercase', 'UPPERCASE',
    'Capitalize Each Word', 'tOGGLE cASE', 'Next case']) && mn.items[5][1] === 'Shift+F3' && mn.items.every((x) => !x[2]) && mn.help
    && mn.top.includes('Change case'), mn);
  for (const [t, want] of [['Sentence case', 'The quick brown fox. It is'], ['lowercase', 'the quick brown fox. it is'], ['UPPERCASE', 'THE QUICK BROWN FOX. IT IS'],
    ['Capitalize Each Word', 'The Quick Brown Fox. It Is'], ['tOGGLE cASE', 'tHE qUICK bROWN fOX. iT iS']]) {
    await ev(([t]) => { const d = window.__doc(); window.__sel(0, 0, 0, 26);
      d.win.menu({}).items.find((i) => i.text === 'Format').submenu().items.find((i) => i.text === 'Change case').submenu().items.find((x) => x.text === t).action(); }, [t]);
    await settle();
    const s = await st();
    ok(`menu ${t}`, s.lines[0] === want, s.lines[0]);
  }

  // nothing to change: no step, no change mark
  const d1 = (await st()).depth;
  await ev(() => { window.__sel(2, 1); });
  await press('Shift+F3');
  const n1 = await st();
  ok('a caret between spaces changes nothing (no undo step)', n1.depth === d1 && n1.lines[2] === '   ', n1);
  // typing then Shift-F3: two steps
  await ev(() => { window.__sel(2, 3); });
  await page.keyboard.type('abc');
  await settle();
  await press('Shift+F3');
  const t1 = await st();
  await press('Control+z');
  const t2 = await st();
  ok('typed "abc" then Shift-F3: the caret word is Title Case; Ctrl-Z undoes only the change', t1.lines[2] === '   Abc' && t2.lines[2] === '   abc', { t1: t1.lines[2], t2: t2.lines[2] });
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
