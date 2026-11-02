// !Letters' spell check in the real desktop (Batch F3, underline paint): the bundled UK dictionary is read from the
// disc ($.MoreApps.!Letters.Dict, through the same vfs path convention as the fonts) when a document opens, the
// state becomes ready with no error reported, a misspelt word is flagged and the red wavy underline is drawn on the
// window's canvas (a zigzag stroked in #e00000), a correct word is not, typing a misspelling into the document
// flags it once the caret leaves the word, and a second window shares the one dictionary read. No page errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { asDraft } from './word-draft.mjs';

const docx = async (body) => Array.from(await buildDocx({ 'word/document.xml': documentXml(body) }));
const files = {
  T: await docx(p(r('The quick brown fox jumps over the lazy dog.')) + p(r('A speling mistake here, and teh colour.'))),
  U: await docx(p(r('Another document with wrng words.'))),
};
const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await asDraft(page);
  await ev(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = (leaf = 'T') => window.__word()?.word.docs.find((d) => d.path.endsWith('.' + leaf))?.dw;
    window.__red = 0;                  // zigzag strokes in the spelling colour
    const stroke = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (...a) {
      if (String(this.strokeStyle).toLowerCase() === '#e00000') window.__red++;
      return stroke.apply(this, a);
    };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    await os.filer.run('RAM::RamDisc0.$.T');
    for (let i = 0; i < 100 && !window.__doc(); i++) await window.__sleep(50);
    window.__doc().win.open({ x: 60, y: 40, w: 900, h: 500, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
  }, files);
  // the dictionary is read from the disc
  const ready = await ev(async () => {
    const d = window.__doc();
    for (let i = 0; i < 200 && !(d.spell && d.spell.dictReady); i++) await window.__sleep(100);
    return { dir: d.app.dir, made: !!d.spell, ready: !!(d.spell && d.spell.dictReady), msgs: window.__msgs };
  });
  ok('the app directory is a disc path', /^ADFS::HardDisc4\.\$\.MoreApps\.!Letters$/i.test(ready.dir ?? ''), ready);
  ok('the state is made and the dictionary read from the disc', ready.made && ready.ready, ready);
  ok('no error reported', ready.msgs.length === 0, ready.msgs);
  const flags = await ev(async () => {
    const d = window.__doc();
    d.spell.ensure(d.spell.paras());
    await window.__frames(4);
    const ps = d.spell.paras();
    return ps.map((q) => (d.spell.flagsOf(q) ?? []).map((f) => f.word));
  });
  ok('misspelt words are flagged, correct ones are not', JSON.stringify(flags) === JSON.stringify([[], ['speling', 'teh']]), flags);
  // the Menu button over a flagged word, by the real pointer: the menu opens by the Wimp's route, its first item is a suggestion, and clicking it in the open menu fixes the word
  const pt = await ev(() => {
    const d = window.__doc(), v = d.view, L = v.L;
    const q = d.d.doc.sections[0].blocks[1];
    const r0 = d.spell.flagsOf(q).find((f) => f.word === 'speling');
    const it = L.flow.find((i) => i.block === q);
    const b = L.selectionRects({ anchor: { id: it.id, off: r0.from }, head: { id: it.id, off: r0.to } })[0];
    const z = v.zoom ?? 1;
    const s = d.win.workToScreen((b.x + b.w / 2) * z, L.top + (b.y + b.h / 2 - L.top) * z);
    const o = document.querySelector('.layer-menus').parentElement.getBoundingClientRect();
    window.__selBefore = JSON.stringify(v.sel);
    return { x: o.left + s.x, y: o.top + s.y };
  });
  await page.mouse.click(pt.x, pt.y, { button: 'middle' });
  await page.waitForFunction(() => os.wimp.menus.isOpen && os.wimp.menus.levels.length > 0, null, { timeout: 5000 });
  const open = await ev(() => os.wimp.menus.levels[0].menu.items.map((i) => String(typeof i.text === 'function' ? i.text() : i.text)));
  ok('Menu button over a flagged word: the open menu starts with a suggestion', open[0] !== 'Save' && open[0] !== '(no suggestions)' && open.includes('Ignore All') && open.includes('Save'), open);
  const box = await page.locator('.menu').nth(0).locator('.mitem[data-index="0"]').boundingBox();
  await page.mouse.click(box.x + 20, box.y + box.height / 2);
  await page.waitForFunction(() => !os.wimp.menus.isOpen, null, { timeout: 5000 });
  await ev(() => window.__frames(3));
  const fixed = await ev(() => ({ after: window.__doc().d.doc.sections[0].blocks[1].text, same: window.__selBefore === JSON.stringify(window.__doc().view.sel) }));
  ok('clicking the suggestion in the menu fixes the word, the selection unmoved', !/speling/.test(fixed.after) && fixed.after.startsWith('A ' + open[0]) && fixed.same, { open, fixed });
  const red = await ev(async () => {
    window.__red = 0;
    window.__doc().win.invalidate();
    await window.__frames(3);
    return window.__red;
  });
  ok('the zigzag is stroked on the window canvas', red >= 1, red);
  // typing a misspelling: flagged once the caret has left the word
  const typed = await ev(async () => {
    const d = window.__doc();
    d.d.apply({ op: 'replaceText', block: [0, 0], at: 3, del: 0, ins: 'qx' });
    await window.__frames(4);
    const ps = d.spell.paras();
    d.spell.ensure(ps);
    return (d.spell.flagsOf(d.d.doc.sections[0].blocks[0]) ?? []).map((f) => f.word);
  });
  ok('an edited paragraph is checked again', typed.some((w) => /qx/i.test(w)), typed);
  // F7: the Spelling box opens in the real desktop at the caret, shows a flagged word (selected in the text) with the
  // suggestions; a real click on a suggestion row puts it in the field, a real click on Change fixes the word and the
  // next one is shown; Return in the field changes again; Escape and a real click on Close hide the box; the Tools menu
  // tick (picked through the real open menu) toggles the underlines
  const sp0 = await ev(async () => {
    const d = window.__doc();
    d.view.setSelection({ anchor: { id: d.d.doc.sections[0].blocks[0].id, off: 0 }, head: { id: d.d.doc.sections[0].blocks[0].id, off: 0 } });
    d.view.focus();
    await window.__frames(2);
    return { words: d.spell.paras().map((q) => (d.spell.flagsOf(q) ?? []).map((f) => f.word)).flat() };
  });
  ok('precondition: two or more flagged words in the document', sp0.words.length >= 2, sp0);
  // (a real click at work-area point (x, y) of the Spelling box)
  const clickBox = async (x, y) => {
    const pt = await ev(([x, y]) => {
      const w = window.__doc().boxes.get('spell');
      const s = w.workToScreen(x, y);
      const o = document.querySelector('.layer-menus').parentElement.getBoundingClientRect();
      return { x: o.left + s.x, y: o.top + s.y };
    }, [x, y]);
    await page.mouse.click(pt.x, pt.y);
    await ev(() => window.__frames(3));
  };
  const clickBtn = async (name) => {
    const c = await ev((name) => {
      const b = window.__doc().boxes.get('spell').iconByName('button:' + name).bbox;
      return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
    }, name);
    await clickBox(c.x, c.y);
  };
  const state = () => ev(() => {
    const d = window.__doc(), a = d.boxes.get('spell').api, sel = d.view.sel;
    const q = sel && d.d.doc.sections[0].blocks.find((b) => b.id === sel.head.id);
    return { hit: a.hit?.word ?? null, sugg: a.ctl.sugg, field: a.field, open: d.boxes.get('spell').isOpen, depth: d.d.undoDepth, texts: d.d.doc.sections[0].blocks.map((b) => b.text),
      selected: q ? q.text.slice(Math.min(sel.anchor.off, sel.head.off), Math.max(sel.anchor.off, sel.head.off)) : null, title: d.boxes.get('spell').title, msg: a.message };
  });
  await page.keyboard.press('F7');
  await page.waitForFunction(() => window.__doc().boxes.get('spell')?.isOpen, null, { timeout: 5000 });
  await ev(() => window.__frames(3));
  const shown = await state();
  ok('F7 opens the Spelling box showing the first flagged word, selected in the text', shown.hit && shown.selected === shown.hit && shown.title === 'Spelling', shown);
  ok('the first suggestion is in the Change to field', shown.sugg.length > 0 && shown.field === shown.sugg[0], shown);
  if (shown.sugg.length > 1) {
    await clickBox(40, 140 + 22 * 1 + 11);        // the second row of the list
    const row = await state();
    ok('a real click on a suggestion row puts it in the field', row.field === shown.sugg[1], { shown, row });
  }
  const pre = await state();
  await clickBtn('Change');
  const changed = await state();
  ok('clicking Change fixes the word (one undo step) and the next flagged word is shown', changed.texts.join('|').includes(pre.field) && changed.depth === pre.depth + 1 && changed.hit !== null && changed.hit !== pre.hit && changed.selected === changed.hit, { pre, changed });
  await page.keyboard.press('Enter');
  await ev(() => window.__frames(3));
  const again = await state();
  ok('Return in the field changes the shown word too (one more undo step)', again.depth === changed.depth + 1 && again.texts.join('|') !== changed.texts.join('|'), { changed, again });
  await page.keyboard.press('Escape');
  await ev(() => window.__frames(2));
  ok('Escape hides the box, the selection stays', !(await state()).open && (await ev(() => !!window.__doc().view.sel)), null);
  await page.keyboard.press('F7');
  await page.waitForFunction(() => window.__doc().boxes.get('spell')?.isOpen, null, { timeout: 5000 });
  await ev(() => window.__frames(3));
  await clickBtn('Close');
  ok('a real click on Close hides the box', !(await state()).open, null);
  // Tools > Check spelling as you type, through the real menu: middle click in the window, Tools, then the item
  const pick = async (texts) => {
    const pt = await ev(() => {
      const d = window.__doc();
      const s = d.win.workToScreen(700, 300);
      const o = document.querySelector('.layer-menus').parentElement.getBoundingClientRect();
      return { x: o.left + s.x, y: o.top + s.y };
    });
    await page.mouse.click(pt.x, pt.y, { button: 'middle' });
    await page.waitForFunction(() => os.wimp.menus.isOpen && os.wimp.menus.levels.length > 0, null, { timeout: 5000 });
    for (let k = 0; k < texts.length; k++) {
      const idx = await ev(([k, t]) => os.wimp.menus.levels[k].menu.items.findIndex((i) => String(typeof i.text === 'function' ? i.text() : i.text) === t), [k, texts[k]]);
      if (idx < 0) return false;
      const bb = await page.locator('.menu').nth(k).locator(`.mitem[data-index="${idx}"]`).boundingBox();
      await page.mouse.click(bb.x + 20, bb.y + bb.height / 2);
      if (k < texts.length - 1) await page.waitForFunction((n) => os.wimp.menus.levels.length > n, k, { timeout: 5000 });
    }
    await page.waitForFunction(() => !os.wimp.menus.isOpen, null, { timeout: 5000 }).catch(() => {});
    return true;
  };
  const underlines = () => ev(async () => {
    const d = window.__doc();
    window.__red = 0;
    d.win.invalidate();
    await window.__frames(3);
    return { red: window.__red, spell: !!d.view.spell };
  });
  await ev(async () => {          // (the fixes left nothing to underline)
    const d = window.__doc();
    d.d.apply({ op: 'replaceText', block: [0, 0], at: 0, del: 0, ins: 'qzx ' });
    d.view.setSelection({ anchor: { id: d.d.doc.sections[0].blocks[1].id, off: 0 }, head: { id: d.d.doc.sections[0].blocks[1].id, off: 0 } });
    d.spell.ensure(d.spell.paras());
    await window.__frames(4);
  });
  const before2 = await underlines();
  const p1 = await pick(['Tools', 'Check spelling as you type']);
  await page.waitForFunction(() => !window.__doc().view.spell, null, { timeout: 5000 }).catch(() => {});
  const off = await underlines();
  const p2 = await pick(['Tools', 'Check spelling as you type']);
  await page.waitForFunction(() => !!window.__doc().view.spell, null, { timeout: 5000 }).catch(() => {});
  const back = await underlines();
  const key = await ev(() => { const m = window.__doc().win.menu({}).items.find((i) => i.text === 'Tools').submenu(); return m.items.find((i) => i.text === 'Spelling...').key; });
  ok('the Tools tick, picked in the real menu, stops and starts the underlines', p1 && p2 && before2.spell && before2.red >= 1 && !off.spell && off.red === 0 && back.spell && back.red >= 1 && key === 'F7', { p1, p2, before2, off, back, key });
  // the second window shares the dictionary read
  const second = await ev(async () => {
    await os.filer.run('RAM::RamDisc0.$.U');
    for (let i = 0; i < 100 && !window.__doc('U'); i++) await window.__sleep(50);
    const u = window.__doc('U');
    for (let i = 0; i < 100 && !(u.spell && u.spell.dictReady); i++) await window.__sleep(100);
    const q = u.spell.paras()[0];
    u.spell.ensure([q]);
    return { ready: !!u.spell.dictReady, words: (u.spell.flagsOf(q) ?? []).map((f) => f.word), msgs: window.__msgs };
  });
  ok('a second window checks too', second.ready && second.words.join() === 'wrng', second);
  // closing the document deletes the box: the controller is disposed, nothing runs on
  const gone = await ev(async () => {
    const d = window.__doc(), w = d.boxes.get('spell');
    w.api.open();
    await window.__frames(2);
    w.delete();
    await window.__frames(3);
    return { gone: w.api.gone, kept: d.boxes.has('spell') };
  });
  ok('deleting the box (as closing the document does) disposes it', gone.gone && !gone.kept, gone);
  const errs = logs.filter((l) => /^(pageerror|error)/.test(l) && !/favicon/.test(l));
  ok('no page errors', errs.length === 0, errs);
} finally {
  console.log(out.join('\n'));
  await browser.close();
}
