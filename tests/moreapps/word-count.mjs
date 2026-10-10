// !Word's word count in the real desktop (./CountBox, ./WordCount):
// Edit > Word count... (no key, never shaded with a caret) opens a
// small Word count window with the numbers of the whole document
// (a table's text, a link's text and a field's result in; field codes
// and deleted text out; empty paragraphs not counted), a selection
// (here across two paragraphs) gives the selection's numbers, asking
// again while it is open refreshes it (one box), Close by a real
// click, Escape and Return close it, nothing changes in the document
// (no undo step, not dirty), the box is deleted with its document,
// 20 open / close cycles leak nothing.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';

const TBL = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid><w:tr>'
  + '<w:tc><w:p><w:r><w:t>cell one</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>cell two</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
const CODE = (s) => `<w:r><w:fldChar w:fldCharType="${s}"/></w:r>`;
const files = {
  Cnt: Array.from(await buildDocx({ 'word/document.xml': documentXml([
    p(r('Hello world')),
    p(r('See ') + '<w:hyperlink w:anchor="x"><w:r><w:t>the link</w:t></w:r></w:hyperlink>'),
    p(''), TBL,
    p('<w:fldSimple w:instr=" PAGE "><w:r><w:t>7</w:t></w:r></w:fldSimple>'),
    p(r('x ') + CODE('begin') + '<w:r><w:instrText> DATE </w:instrText></w:r>' + CODE('separate') + r('today') + CODE('end')),
    p('<w:del w:id="1" w:author="a"><w:r><w:delText>gone words</w:delText></w:r></w:del>' + r('kept')),
  ].join('')) })),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(3));
const press = async (k) => { await page.keyboard.press(k); await settle(); };
const click = async (q) => { await wait(450); await page.mouse.click(q.x, q.y); await wait(60); await settle(); };
const sel = (i, a, j = i, b = a) => ev(([i, a, j, b]) => window.__sel(i, a, j, b), [i, a, j, b]);
const open = async () => {
  await ev(() => {
    const d = window.__doc();
    d.win.menu({}).items.find((i) => i.text === 'Edit').submenu().items.find((i) => i.text === 'Word count...').action();
  });
  await settle();
};
const st = () => ev(() => window.__st());

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
    window.__doc = () => window.__word()?.word.docs.find((d) => !d.closed && d.leaf === 'Cnt');
    window.__client = (win, x, y) => {
      const s = win.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__box = () => {
      const d = window.__doc();
      return d && d.dw.boxes.has('count') ? window.__word().word.dialog({ key: 'count:' + d.docKey, rows: [] }) : null;
    };
    window.__icon = (name) => {
      const w = window.__box().win, b = w.iconByName(name).bbox;
      return window.__client(w, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    };
    window.__sel = (i, a, j, b) => {
      const d = window.__doc(), L = d.view.layout;
      d.view.setSelection({ id: L.items[i].id, off: a }, { id: L.items[j].id, off: b });
      d.dw.view.focus();
    };
    window.__st = () => {
      const d = window.__doc(), b = window.__box(), w = b?.win, c = os.wimp.caret;
      const t = (n) => w?.iconByName(n)?.text;
      return { depth: d.view.undoDepth, dirty: d.view.dirty, beeps: window.__beeps,
        box: w ? { open: w.isOpen, title: w.title, scope: t('scope'), words: t('words'), noSpaces: t('noSpaces'),
          chars: t('chars'), paras: t('paras'), lines: t('lines'), note: t('note') } : null,
        count: d.count(), caret: c?.window === d.win ? 'doc' : c?.window && c.window === w ? 'box' : null,
        windows: os.wimp.windows.size };
    };
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await os.filer.run('RAM::RamDisc0.$.Cnt');
    for (let i = 0; i < 200 && !window.__doc(); i++) await window.__sleep(50);
    window.__doc().win.open({ x: 40, y: 40, w: 640, h: 330, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    return { ok: !!window.__doc(), msgs: window.__msgs };
  }, files);
  ok('the document opens', s0.ok && !s0.msgs.length, s0);
  const base = await ev(() => os.wimp.windows.size);

  // ---------------------------------------------------- the menu item
  const mi = await ev(() => {
    const d = window.__doc(), it = d.win.menu({}).items.find((i) => i.text === 'Edit').submenu().items.map((i) => i.text);
    const row = d.win.menu({}).items.find((i) => i.text === 'Edit').submenu().items.find((i) => i.text === 'Word count...');
    return { last: it.at(-1), key: row.key ?? null, shaded: typeof row.shaded === 'function' ? !!row.shaded() : !!row.shaded };
  });
  ok('Edit ends with Word count... (no key), live with a caret', mi.last === 'Word count...' && mi.key === null && !mi.shaded, mi);

  // ---------------------------------------------------- the whole document
  await sel(0, 3);
  const d0 = await st();
  await open();
  const a1 = await st();
  ok('Edit > Word count... opens "Word count" for the whole document (a caret): 13 words, 51 characters, 45 without spaces, 7 paragraphs, 6 lines (the layout\'s: a table has none)',
    a1.box?.open && a1.box.title === 'Word count' && /document/.test(a1.box.scope) && a1.box.words === '13' && a1.box.chars === '51'
    && a1.box.noSpaces === '45' && a1.box.paras === '7' && a1.box.lines === '6' && a1.box.note === '', a1);
  ok('... table text, link text and a field\'s result in; field codes, deleted text and the empty paragraph out (the hook agrees)',
    a1.count.words === 13 && a1.count.chars === 51 && a1.count.charsNoSpaces === 45 && a1.count.paras === 7 && a1.count.lines === 6
    && a1.count.scope === 'document', a1.count);
  ok('... the document is untouched: no undo step, not dirty, no beep', a1.depth === d0.depth && !a1.dirty && a1.beeps === d0.beeps, a1);
  await click(await ev(() => window.__icon('button:Close')));
  const a2 = await st();
  ok('Close (a real click) closes it and the caret goes back to the document', !a2.box?.open && a2.depth === d0.depth, a2);

  // ---------------------------------------------------- a selection across two paragraphs
  await sel(0, 6, 1, 3);
  await open();
  const b1 = await st();
  ok('"world" and "See" selected: the selection\'s numbers (2 words, 8 characters, 8 without spaces, 2 paragraphs, 2 lines)',
    b1.box?.open && /selection/.test(b1.box.scope) && b1.box.words === '2' && b1.box.chars === '8' && b1.box.noSpaces === '8'
    && b1.box.paras === '2' && b1.box.lines === '2', b1);
  // the selection changes while it is open; asking again refreshes the same box
  await sel(0, 0, 0, 5);
  await open();
  const b2 = await st();
  ok('asked again while open: the same box, refreshed ("Hello": 1 word, 5 characters)',
    b2.box?.words === '1' && b2.box.chars === '5' && b2.windows === b1.windows, b2);
  await sel(3, 0);
  await open();
  const b3 = await st();
  ok('a caret again: back to the whole document', /document/.test(b3.box.scope) && b3.box.words === '13', b3);
  await press('Escape');
  const b4 = await st();
  ok('Escape closes it', !b4.box?.open, b4);
  await open();
  await press('Enter');
  const b5 = await st();
  ok('Return closes it too (Close is the default button); nothing changed', !b5.box?.open && b5.depth === d0.depth && !b5.dirty, b5);

  // ---------------------------------------------------- an edit changes the numbers
  await sel(0, 11);
  await page.keyboard.type(' again now', { delay: 5 });
  await settle();
  await open();
  const c1 = await st();
  ok('after typing " again now" the count is 15 words', c1.box?.words === '15' && c1.count.words === 15, c1);
  await press('Escape');
  await press('Control+z');

  // ---------------------------------------------------- leaks, and deleted with the document
  const counts = () => ev(() => {
    const t = window.__word(), n = (e) => [...e._h.values()].reduce((a, l) => a + l.length, 0);
    return { win: os.wimp.windows.size, task: t.windows.size, icons: document.querySelectorAll('.icon').length,
      wl: n(os.wimp), tl: n(t), menus: os.wimp.menus.isOpen };
  });
  await ev(() => window.__doc().dw.view.focus());
  const k0 = await counts();
  for (let i = 0; i < 20; i++) {
    await open();
    await press('Escape');
  }
  const k1 = await counts();
  ok('20 open / Escape cycles leave nothing behind', same(k0, k1), { k0, k1 });
  await ev(async () => {
    const d = window.__doc();
    d.save();
    for (let i = 0; i < 100 && d.saving; i++) await window.__sleep(30);
    d.dw.view.focus();
  });
  await open();
  const z0 = await ev(() => { window.__bw = window.__box().win; return !!window.__bw.isOpen; });
  await ev(async () => { window.__doc().requestClose(); await window.__frames(3); });
  const z1 = await ev(() => ({ doc: !!window.__doc(), gone: ![...os.wimp.windows.values()].includes(window.__bw), win: os.wimp.windows.size }));
  ok('closing the document deletes the open box', z0 && !z1.doc && z1.gone && z1.win < base, { z0, z1, base });
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
