// !Word's Picture dialogue box in the real desktop (Batch B, B6:
// ./PicBox, ./PicPatch): a double-click on a picture and Format >
// Picture... open it filled (2", 1", alt text); the menu item is shaded
// without a picture selected; Escape and Cancel change nothing; Width 3
// typed with Keep proportions then OK is one undo step and the picture
// is redrawn 3 in wide; Reset size on a 300 dpi PNG shows its size and
// OK applies it; alt text typed is saved as docPr descr; an out of
// range size beeps, says why and keeps the box; a floating picture's
// size controls are shaded, its alt text applied, the anchor XML
// otherwise byte for byte; a selection that moved while the box was
// open refills it with a beep; the box goes with its document; 20
// cycles leak nothing.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { picDocx, pngBytes } from './pic-fixtures.mjs';
import { p, r } from './build-docx.mjs';
import { readZip } from '../../tools/moreapps/!WimpLib/Zip';

const RED = [220, 20, 30];
const files = {
  Pb: Array.from(await picDocx({
    pics: [
      { bytes: pngBytes(40, 20, { rgb: RED }), cx: 1828800, cy: 914400, descr: 'A red box' },
      { bytes: pngBytes(8, 8, { rgb: RED }), kind: 'anchor', cx: 914400, cy: 457200, descr: 'Floater' },
      { bytes: pngBytes(600, 300, { rgb: RED, dpi: 300 }), cx: 3657600, cy: 1828800 },
      { bytes: pngBytes(192, 192, { rgb: RED }), cx: 1828800, cy: 914400 },             // natural 2 in x 2 in: its width is already 2 in
      { bytes: pngBytes(101, 101, { rgb: RED, dpi: 300 }), cx: 1828800, cy: 914400 },   // natural 307848 EMU (not a whole number of twips)
    ],
    body: p(r('The end of the document.')),
  })),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(3));
const press = async (k) => { await page.keyboard.press(k); await settle(); };
const click = async (q) => { await page.mouse.click(q.x, q.y); await wait(60); await settle(); };
const st = () => ev(() => window.__st());
const box = () => ev(() => window.__bx());
const icon = (n) => ev((n) => window.__icon(n), n);
const centre = (i) => ev((i) => window.__centre(i), i);
/** Replace a field's text with real keys. */
const field = async (name, text) => {
  await click(await icon(name));
  await press('End');
  for (let i = 0; i < 30; i++) await page.keyboard.press('Backspace');
  if (text) await page.keyboard.type(text);
  await settle();
};
const openMenu = () => ev(() => window.__fmt().action());
/** The saved file's parts (name -> text). */
const saved = async () => {
  const a = await ev(async () => Array.from(await os.vfs.readFile('RAM::RamDisc0.$.Pb')));
  const z = await readZip(new Uint8Array(a));
  return Object.fromEntries([...z].map(([n, b]) => [n, new TextDecoder().decode(b)]));
};

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  const s0 = await ev(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [k, v] of Object.entries(files)) os.vfs.writeFile('RAM::RamDisc0.$.' + k, new Uint8Array(v), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = () => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === 'Pb');
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    window.__net = 0;
    for (const tgt of [window, document]) {
      const add = tgt.addEventListener.bind(tgt), rem = tgt.removeEventListener.bind(tgt);
      const seen = new Set();
      tgt.addEventListener = (t, f, o) => { const key = [t, f, !!(o === true || o?.capture)].join('|'); if (!seen.has(f + key)) { seen.add(f + key); window.__net++; } return add(t, f, o); };
      tgt.removeEventListener = (t, f, o) => { const key = [t, f, !!(o === true || o?.capture)].join('|'); if (seen.delete(f + key)) window.__net--; return rem(t, f, o); };
    }
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__pics = (d) => {
      const L = d.view.layout, res = [];
      for (const it of L.items) for (const ln of it.lines || []) for (const x of ln.items) {
        if (x.kind !== 'pic') continue;
        const base = it.y + ln.y + ln.base + (x.dy || 0);
        res.push({ x: L.left + x.x, y: base - x.pic.h, w: x.pic.w, h: x.pic.h });
      }
      return res;
    };
    window.__centre = (i) => { const d = window.__doc(), b = window.__pics(d)[i]; return window.__client(d.win, b.x + b.w / 2, b.y + b.h / 2); };
    window.__fmt = () => d_fmt();
    const d_fmt = () => window.__doc().win.menu({}).items.find((i) => i.text === 'Format').submenu().items.find((i) => i.text === 'Picture...');
    window.__bx = () => {
      const d = window.__doc();
      const a = d && d.dw.boxes.has('pic') ? window.__word().word.dialog({ key: 'pic:' + d.docKey, rows: [] }) : null;
      if (!a) return null;
      const w = a.win, sh = (n) => !!w.iconByName(n).shaded;
      return { open: a.isOpen, title: w.title, v: a.values(), msg: w.iconByName('msg').text,
        shaded: ['width', 'height', 'keep', 'reset', 'alt'].filter(sh),
        caret: os.wimp.caret?.window === w ? os.wimp.caret.icon?.name : os.wimp.caret?.window === d.win ? 'doc' : null,
        text: { width: w.iconByName('width').text, height: w.iconByName('height').text } };
    };
    window.__icon = (n) => {
      const d = window.__doc(), w = window.__word().word.dialog({ key: 'pic:' + d.docKey, rows: [] }).win;
      const b = w.iconByName(n).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    window.__st = () => {
      const d = window.__doc(), v = d.view, doc = d.d.doc;
      const pi = window.__pics(d).map((b) => [Math.round(b.w), Math.round(b.h)]);
      const q = v.pic && v.pic();
      return { depth: v.undoDepth, beeps: window.__beeps, dirty: v.dirty, msgs: window.__msgs.slice(), pics: pi, q,
        node: doc.sections[0].blocks.map((b) => b.inlines?.[0]?.node) };
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await os.filer.run('RAM::RamDisc0.$.Pb');
    for (let i = 0; i < 200 && !window.__doc(); i++) await window.__sleep(50);
    const d = window.__doc();
    d.win.open({ x: 40, y: 40, w: 860, h: 800, behind: 'top', scrollX: 0, scrollY: 0 });
    d.dw.view.focus();
    await window.__frames(4);
    await window.__sleep(300);
    await window.__frames(4);
    return { ok: !!d, n: window.__pics(d).length, msgs: window.__msgs, l: d.view.lines() };
  }, files);
  ok('the document opens with five pictures', s0.ok && s0.n === 5 && !s0.msgs.length, s0);
  const base = await ev(() => ({ windows: os.wimp.windows.size, net: window.__net }));

  // ---------------------------------------------------- not a picture
  const m0 = await ev(() => { const it = window.__fmt(); return { shaded: !!(typeof it.shaded === 'function' ? it.shaded() : it.shaded), names: window.__doc().win.menu({}).items.find((i) => i.text === 'Format').submenu().items.map((i) => i.text) }; });
  ok('Format > Picture... follows Borders and shading... and is shaded with the caret in text',
    m0.shaded && m0.names.indexOf('Picture...') === m0.names.indexOf('Borders and shading...') + 1, m0);
  const t0 = await st();
  await openMenu();
  await settle();
  const t1 = await st();
  ok('asked for with no picture selected: a beep, no box', (await box()) === null && t1.beeps === t0.beeps + 1, t1.beeps);

  // ---------------------------------------------------- a double-click opens it, filled
  await wait(450);
  const q = await centre(0);
  await page.mouse.dblclick(q.x, q.y);
  await wait(60);
  await settle();
  const b1 = await box();
  ok('a double-click on a picture opens the Picture box filled: 2", 1", keep on, its alt text, the caret in Width',
    b1 && b1.open && b1.title === 'Picture' && b1.v.width === 2880 && b1.v.height === 1440 && b1.v.keep === true && b1.v.alt === 'A red box'
      && b1.text.width === '2"' && b1.text.height === '1"' && !b1.shaded.length && b1.caret === 'width', b1);
  const w1 = await ev(() => os.wimp.windows.size);
  await ev(() => window.__fmt().action());
  await settle();
  ok('Format > Picture... on it: the same box (one box per document)', (await ev(() => os.wimp.windows.size)) === w1, w1);
  await press('Escape');
  const e1 = await st();
  ok('Escape: the box goes, nothing changed, the caret back in the document', (await box()) === null && e1.depth === t0.depth && !e1.dirty, e1);

  // ---------------------------------------------------- Cancel
  await click(await centre(0));
  await openMenu();
  await settle();
  await field('width', '5');
  await click(await icon('button:Cancel'));
  const c1 = await st();
  ok('Cancel after typing a width: nothing changed', (await box()) === null && c1.depth === t0.depth && c1.pics[0][0] === 192, c1.pics);

  // ---------------------------------------------------- Width 3 + OK
  await openMenu();
  await settle();
  await field('width', '3');
  await click(await icon('button:OK'));
  const o1 = await st();
  ok('Width 3 + OK with Keep proportions: the picture 3 in x 1.5 in, ONE undo step, the star, the box gone',
    (await box()) === null && o1.depth === t0.depth + 1 && o1.q && o1.q.cx === 2743200 && o1.q.cy === 1371600 && o1.pics[0][0] === 288 && o1.pics[0][1] === 144 && o1.dirty, o1);
  await press('Control+z');
  const o2 = await st();
  ok('Ctrl-Z gives the old size back in one step', o2.depth === t0.depth && o2.q.cx === 1828800 && o2.pics[0][0] === 192, o2);

  // ---------------------------------------------------- Keep off: width only
  await openMenu();
  await settle();
  await click(await icon('keep'));
  await field('width', '3');
  await click(await icon('button:OK'));
  const k1 = await st();
  ok('Keep proportions off: the width only', k1.q.cx === 2743200 && k1.q.cy === 914400, k1.q);
  await press('Control+z');

  // ---------------------------------------------------- out of range
  await openMenu();
  await settle();
  const bp = (await st()).beeps;
  await field('width', '23');
  await click(await icon('button:OK'));
  const r1 = await box(), r1s = await st();
  ok('23 in: a beep, a message, the box kept, nothing changed', r1 && r1.open && r1.msg === 'Width and Height must be lengths from 0.01" to 22".' && r1s.beeps === bp + 1 && r1s.depth === t0.depth, [r1, r1s.beeps, bp]);
  await field('width', '1.2.3');
  await click(await icon('button:OK'));
  const r2 = await box();
  ok('text that is not a length: the same', r2 && r2.open && r2.msg !== '' && (await st()).depth === t0.depth, r2);
  await field('width', '');
  await click(await icon('button:OK'));
  const r3 = await box();
  ok('an emptied Width is refused the same way, the box kept', r3 && r3.open && r3.msg === 'Width and Height must be lengths from 0.01" to 22".' && (await st()).depth === t0.depth, r3);
  await press('Escape');

  // ---------------------------------------------------- alt text saved
  await openMenu();
  await settle();
  await field('alt', 'A big red rectangle');
  await click(await icon('button:OK'));
  const a1 = await st();
  ok('alt text typed + OK: one undo step, the size unchanged', a1.depth === t0.depth + 1 && a1.q.alt === 'A big red rectangle' && a1.q.cx === 1828800, a1.q);

  // ---------------------------------------------------- the alt text cleared
  await press('Control+s');
  await wait(400);
  const x1 = (await saved())['word/document.xml'];
  await openMenu();
  await settle();
  await field('alt', '');
  await click(await icon('button:OK'));
  const a2 = await st();
  ok('an emptied Alt text removes the description: one undo step', a2.depth === a1.depth + 1 && a2.q.alt === '', a2.q);
  await press('Control+s');
  await wait(400);
  const x2 = (await saved())['word/document.xml'];
  ok('... the saved file has no descr on it any more (and had one before)', /descr="A big red rectangle"/.test(x1) && !/A big red rectangle/.test(x2) && /descr="Floater"/.test(x2), x2.slice(0, 300));
  await press('Control+z');

  // ---------------------------------------------------- asked again for another picture: refilled
  await click(await centre(2));
  await openMenu();
  await settle();
  const rf0 = await box();
  await click(await centre(0));
  await ev(() => window.__fmt().action());
  await settle();
  const rf1 = await box();
  ok('asked again for another picture while open: the box shows that one', rf0.v.width === 5760 && rf1.v.width === 2880 && rf1.v.alt === 'A big red rectangle', [rf0.v, rf1.v]);
  await press('Escape');

  // ---------------------------------------------------- a floating picture
  await click(await centre(1));
  await openMenu();
  await settle();
  const f1 = await box();
  ok('a floating picture: Width, Height, Keep and Reset size shaded, alt text editable',
    f1 && ['height', 'keep', 'reset', 'width'].every((n) => f1.shaded.includes(n)) && !f1.shaded.includes('alt') && f1.v.alt === 'Floater', f1);
  await field('alt', 'Moved');
  await click(await icon('button:OK'));
  const f2 = await st();
  ok('... its alt text applied, the size untouched', f2.depth === a1.depth + 1 && f2.q.alt === 'Moved' && f2.q.floating && f2.q.cx === 914400, f2.q);

  // ---------------------------------------------------- Reset size on the 300 dpi PNG
  await click(await centre(2));
  await openMenu();
  await settle();
  const g0 = await box();
  await click(await icon('reset'));
  const g1 = await box(), g1s = await st();
  ok('Reset size on a 300 dpi PNG: Width 2", Height 1", not applied yet', g0.v.width === 5760 && g1.v.width === 2880 && g1.v.height === 1440 && g1s.depth === f2.depth && g1s.q.cx === 3657600, [g0.v, g1.v]);
  await click(await icon('button:OK'));
  const g2 = await st();
  ok('... OK applies it', g2.depth === f2.depth + 1 && g2.q.cx === 1828800 && g2.q.cy === 914400 && g2.pics[2][0] === 192, g2.q);

  // ---------------------------------------------------- Reset size, one side already natural
  await click(await centre(3));
  await openMenu();
  await settle();
  await click(await icon('reset'));
  await click(await icon('button:OK'));
  const h2 = await st();
  ok('Reset size when the width is already the natural one: OK sets 2 in x 2 in, not a recomputed 4 in x 2 in', h2.q.cx === 1828800 && h2.q.cy === 1828800, h2.q);
  await click(await centre(4));
  await openMenu();
  await settle();
  await click(await icon('reset'));
  await click(await icon('button:OK'));
  const h3 = await st();
  ok('Reset size: the natural extent exactly (307848 EMU, no rounding to twips)', h3.q.cx === 307848 && h3.q.cy === 307848, h3.q);

  // ---------------------------------------------------- saved file
  await press('Control+s');
  await wait(400);
  const parts = await saved();
  const xml = parts['word/document.xml'];
  ok('the saved file holds the alt texts and sizes', /descr="A big red rectangle"/.test(xml) && /descr="Moved"/.test(xml) && /<wp:extent cx="1828800" cy="914400"\/>/.test(xml), xml.slice(0, 400));
  const anchor = (s) => s.slice(s.indexOf('<wp:anchor'), s.indexOf('</wp:anchor>'));
  const orig = await readOrig();
  ok('the anchor XML is byte-equal to the original but for descr', anchor(xml) === anchor(orig).replace('descr="Floater"', 'descr="Moved"'), [anchor(xml).slice(0, 200)]);

  // ---------------------------------------------------- a stale selection
  await click(await centre(0));
  await openMenu();
  await settle();
  await field('width', '4');
  const sd = (await st()).depth, sb = (await st()).beeps;
  await ev(() => { const d = window.__doc(), L = d.view.layout; d.view.setSelection({ id: L.items[0].id, off: 0 }, { id: L.items[0].id, off: 0 }); });
  await click(await icon('button:OK'));
  const s1 = await box(), s1s = await st();
  ok('the picture no longer selected: OK beeps, says so, keeps the box, changes nothing', s1 && s1.open && s1.msg !== '' && s1s.beeps === sb + 1 && s1s.depth === sd, [s1, s1s.beeps, sb]);
  await press('Escape');
  await click(await centre(0));
  await openMenu();
  await settle();
  await field('width', '4');
  await ev(() => { const d = window.__doc(), L = d.view.layout, id = L.items[2].id; d.view.setSelection({ id, off: 0 }, { id, off: 1 }); });
  await click(await icon('button:OK'));
  const s2 = await box(), s2s = await st();
  ok('another picture selected meanwhile: refilled from it with a beep, nothing applied', s2 && s2.open && s2.v.width === 2880 && s2s.depth === sd, [s2, s2s.depth, sd]);
  await press('Escape');

  // ---------------------------------------------------- 20 cycles
  await click(await centre(0));
  const n0 = await ev(() => ({ net: window.__net, windows: os.wimp.windows.size, tw: window.__word().windows.size, dom: document.querySelectorAll('*').length }));
  const l0 = await st();
  for (let i = 0; i < 20; i++) {
    await openMenu();
    await settle();
    await press('Escape');
  }
  const n1 = await ev(() => ({ net: window.__net, windows: os.wimp.windows.size, tw: window.__word().windows.size, dom: document.querySelectorAll('*').length }));
  const l1 = await st();
  ok('20 open / Escape cycles: nothing changed and nothing left behind', l1.depth === l0.depth && n1.net === n0.net && n1.windows === n0.windows && n1.tw === n0.tw && Math.abs(n1.dom - n0.dom) <= 5, [n0, n1]);

  // ---------------------------------------------------- B2: Insert > Hyperlink on a picture
  await press('Escape');
  const hl = await ev(async () => {
    const d = window.__doc(), v = d.view, id = v.layout.items[0].id;
    v.setSelection({ id, off: 0 }, { id, off: 1 });
    const b0 = window.__beeps, depth = v.undoDepth;
    d.win.menu({}).items.find((i) => i.text === 'Insert').submenu().items.find((i) => /^Hyperlink/.test(i.text)).action();
    await window.__sleep(100);
    const api = window.__word().word.dialog({ key: 'link:' + d.docKey, rows: [] }), w = api.win;
    const msg = w.iconByName('msg').text + ' ' + w.iconByName('msg2').text;
    api.press?.('OK');
    await window.__sleep(50);
    const out = { open: w.isOpen, msg, beeps: window.__beeps - b0, depth: v.undoDepth - depth };
    d.dw.boxes.get('link')?.delete?.();
    d.dw.view.focus();
    return out;
  });
  ok('B2: Insert > Hyperlink on a selected picture: a beep and "A picture cannot be made a link yet.", nothing changed',
    /A picture cannot be made a link yet\./.test(hl.msg) && hl.beeps >= 1 && hl.depth === 0, hl);

  // ---------------------------------------------------- deleted with its document
  await openMenu();
  await settle();
  const gone = await ev(async () => { const d = window.__doc(), n = os.wimp.windows.size; d.dw.close(); await window.__sleep(150); return { boxes: d.dw.boxes.size, left: n - os.wimp.windows.size }; });
  ok('the box is deleted with its document', gone.boxes === 0 && gone.left >= 2, gone);
  ok('no more windows than at the start', (await ev(() => os.wimp.windows.size)) <= base.windows, base);
  ok('no error reported', !(await ev(() => window.__msgs)).length, await ev(() => window.__msgs));
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;

/** The original file's document.xml. */
async function readOrig() {
  const z = await readZip(new Uint8Array(files.Pb));
  return new TextDecoder().decode(z.get('word/document.xml'));
}
