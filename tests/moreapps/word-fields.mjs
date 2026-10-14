// !Letters' field shading and field codes in the real desktop (Batch
// D P8.4, D18, R2): a body paragraph "Page { PAGE } of the text" and
// a footer "Page { PAGE }". View > Field shading: When selected (the
// default) paints #d8d8d8 behind the PAGE result only while the caret
// is at the field, Always with the caret elsewhere too, Never not
// even with the caret there (by pixel); the choice kept in
// Choices:Letters ('fieldShading') and ticked in the menu. Shift+F9
// (View > Field codes, ticked) shows "{ PAGE }" in place of the
// result, in the body and in the footer, and again shows the result;
// no undo step, the document unchanged. F9 still redoes (a word typed,
// undone with F8, comes back with F9). Saved with the codes shown,
// every part is byte for byte as saved showing the results, and the
// footer part (with its field) and the package relationships as in
// the file opened (the writer writes the body and adds the styles
// part this test file lacks, codes or not). Edit > Update field and
// Update all fields (P9.1, D19, R2): no key shown; with the caret in
// plain text a beep and no step; with the caret after a body PAGE
// field on page 3 (stored 1) it stores 3 (one undo step, F8 undoes
// it), the DATE and the locked PAGE next to it untouched; Update all
// stores 3 and today's date, the locked field still 1; in the footer
// mode on page 3 Update field stores the footer's 3, the body not
// changed, and Update all fields is shaded; in Draft Update field
// still stores the field's page (pages made for it). A 2-page
// document paginated within its first paint (P8 fix I1) shows its
// body fields computed at once: "Page 1 of 2", on page 2 "Page 2 of
// 2" and PAGE \* roman "ii", the stored results unchanged. Insert >
// Page number in a footer (P9.2, D19): the footer mode entered by a
// double-click on page 1, the caret at the end of "Foot ", Insert >
// Page number: one undo step, the footer holds a PAGE field, and
// pages 1, 2 and 3 show "Foot 1", "Foot 2", "Foot 3". The Field box
// (Insert > Field...): 3.6 inches wide, PAGE's code shown; an empty
// code refused with a beep and a message, the box kept, nothing
// changed; Escape changes nothing; a code typed and Return puts the
// field in (one step, filled at once). The window's clock (P9 fix
// I2): with the window shown as opened at 14:05 long ago, Insert >
// Time shows the time it stores at once, and Update field on that
// TIME field (shown 14:05 again) shows the time it stores. A code
// typed in the Field box survives a stale OK (the selection moved:
// a beep and the message, the code kept; P9 fix M2), and the next OK
// puts it in. Needs the
// disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { p, r } from './build-docx.mjs';
import { wordHf, BODY } from './hf-fixtures.mjs';
import { fld } from './field-fixtures.mjs';
import { readZip } from '../../tools/moreapps/!WimpLib/Zip';

const CHOICES = 'ADFS::HardDisc4.$.!Boot.Choices.Letters';
const BR = '<w:r><w:br w:type="page"/></w:r>';
const files = {
  Upd: await wordHf({ body: p(r('one') + BR) + p(r('two') + BR) + p(r('Page ') + fld(' PAGE ', '1') + r(' date ')
    + fld(' DATE ', '01/01/2000') + r(' locked ') + fld(' PAGE ', '1', { lock: true })) + p(r('plain')) + BODY(2),
  default: { ftr: p(r('Foot ') + fld(' PAGE ', '1')) } }),
  Short: await wordHf({ body: p(r('Page ') + fld(' PAGE ', '1') + r(' of ') + fld(' NUMPAGES ', '1') + BR)
    + p(r('Page ') + fld(' PAGE ', '1') + r(' of ') + fld(' NUMPAGES ', '1') + r(' roman ') + fld(' PAGE \\* roman ', '1')) }),
  Ins: await wordHf({ body: p(r('one') + BR) + p(r('two') + BR) + p(r('three')),
    default: { ftr: p(r('Foot ')) } }),
  Flds: await wordHf({ body: p(r('Page ') + fld(' PAGE ', '1') + r(' of the text')) + BODY(6),
    default: { ftr: p(r('Page ') + fld(' PAGE ', '1')) } }),
};
for (const k of Object.keys(files)) files[k] = Array.from(files[k]);

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);

const { browser, page, logs } = await launch({ height: 1000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(3));
const press = async (k) => { await page.keyboard.press(k); await settle(); };
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async ([files, CHOICES]) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    if (os.vfs.exists(CHOICES)) os.vfs.delete(CHOICES);
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => d.leaf === leaf);
    window.__open = async (leaf) => {
      await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      await window.__frames(3);
      return window.__doc(leaf);
    };
    /** The colour of d's canvas at a work-area point (visible) -> [r, g, b]. */
    window.__px = (d, x, y) => {
      const w = d.win, cv = w._canvas, k = cv.width / w.w;
      const q = cv.getContext('2d').getImageData(Math.round((x - w.scrollX) * k), Math.round((y - w.scrollY) * k), 1, 1).data;
      return [q[0], q[1], q[2]];
    };
    /** The body's PAGE field: its paragraph, begin and end offsets (from its computed token). */
    window.__fld = (d) => {
      const L = d.dw.L, it = L.items[0];
      const x = it.lines.flatMap((l) => l.items).find((y) => y.field);
      return x && { id: it.id, b: x.field.b, e: x.field.e, text: x.text };
    };
    /** Of the top pixel row of the field's line, across the field: the share that is #d8d8d8. */
    window.__shaded = async (d) => {
      d.win.invalidate();
      await window.__frames(2);
      const f = window.__fld(d), L = d.dw.L;
      const a = L.caretRect({ id: f.id, off: f.b }), z = L.caretRect({ id: f.id, off: f.e + 1 });
      d.win.scrollTo(0, Math.max(0, a.y - 100));
      await window.__frames(2);
      let n = 0, grey = 0;
      for (let x = Math.ceil(a.x) + 1; x < Math.floor(z.x) - 1; x++) {
        for (const y of [a.y + 1, a.y + a.h - 2]) {
          const c = window.__px(d, x, y);
          n++;
          if (c[0] === 216 && c[1] === 216 && c[2] === 216) grey++;
        }
      }
      return n ? grey / n : -1;
    };
    /** The texts d's window draws in one redraw (fillText spied on, put back). */
    window.__drawn = async (d) => {
      const proto = CanvasRenderingContext2D.prototype, real = proto.fillText, seen = [];
      const cv = d.win._canvas;
      proto.fillText = function (t, ...a) {
        if (this.canvas === cv) seen.push(String(t));
        return real.call(this, t, ...a);
      };
      try {
        d.win.invalidate();
        await window.__frames(2);
      } finally {
        proto.fillText = real;
      }
      return seen;
    };
    /** View menu item `text` of d's window (a submenu's item: [text, sub]). */
    window.__item = (d, text, sub) => {
      const v = d.win.menu({}).items.find((i) => i.text === 'View').submenu();
      const it = v.items.find((i) => i.text === text);
      return sub ? it.submenu().items.find((i) => i.text === sub) : it;
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
  }, [files, CHOICES]);

  const s0 = await ev(async () => {
    const d = await window.__open('Flds');
    d.win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    d.dw.L.place.pages.finish();
    d.win.bringToFront();
    d.dw.view.focus();
    await window.__frames(2);
    const f = window.__fld(d);
    d.view.setSelection({ id: d.dw.L.items[1].id, off: 0 });
    return { f, view: d.viewName, focus: os.wimp.caret?.window === d.win };
  });
  ok('the document opens in Print layout with the body\'s PAGE field shown computed', s0.view === 'print' && s0.f && s0.f.text === '1' && s0.focus, s0);

  // ------------------------------------------------ field shading
  const shade = (where) => ev(async (where) => {
    const d = window.__doc('Flds'), f = window.__fld(d);
    d.view.setSelection(where === 'in' ? { id: f.id, off: f.e + 1 } : { id: d.dw.L.items[1].id, off: 0 });
    await window.__frames(2);
    return window.__shaded(d);
  }, where);
  const ticks = () => ev(() => ['Never', 'When selected', 'Always'].map((t) => {
    const it = window.__item(window.__doc('Flds'), 'Field shading', t);
    return it && !!(typeof it.ticked === 'function' ? it.ticked() : it.ticked);
  }));
  const choose = (t) => ev(async (t) => { window.__item(window.__doc('Flds'), 'Field shading', t).action(); await window.__frames(3); }, t);
  const t0 = await ticks();
  const a0 = await shade('out'), a1 = await shade('in');
  ok('Field shading: When selected is the default (ticked)', JSON.stringify(t0) === '[false,true,false]', t0);
  ok('... no shading with the caret elsewhere; #d8d8d8 behind the result with the caret at the field', a0 === 0 && a1 > 0.8, { a0, a1 });
  await choose('Always');
  const b0 = await shade('out'), t1 = await ticks();
  const c1 = await ev(async (C) => JSON.parse(await os.vfs.readText(C)), CHOICES);
  ok('Always: shaded with the caret elsewhere too; ticked; kept in Choices:Letters', b0 > 0.8
    && JSON.stringify(t1) === '[false,false,true]' && c1.fieldShading === 'always', { b0, t1, c1 });
  await choose('Never');
  const n1 = await shade('in');
  const c2 = await ev(async (C) => JSON.parse(await os.vfs.readText(C)), CHOICES);
  ok('Never: not shaded even with the caret at the field; kept', n1 === 0 && c2.fieldShading === 'never', { n1, c2 });
  await choose('When selected');

  // ------------------------------------------------ Shift+F9: field codes
  const st = () => ev(async () => {
    const d = window.__doc('Flds'), drawn = (await window.__drawn(d)).join(' ');
    d.win.scrollTo(0, 1e6);
    await window.__frames(2);
    const low = (await window.__drawn(d)).join(' ');
    d.win.scrollTo(0, 0);
    await window.__frames(2);
    const it = window.__item(d, 'Field codes');
    return { body: drawn, low, ticked: !!it.ticked(), key: it.key || '',
      text: d.d.doc.sections[0].blocks[0].text, f: window.__fld(d), stateId: d.stateId };
  });
  const k0 = await st();
  const before = await ev(async () => Array.from(await window.__doc('Flds').saveBytes()));
  await ev(async () => { const d = window.__doc('Flds'); d.win.bringToFront(); d.dw.view.focus(); await window.__frames(2); });
  await press('Shift+F9');
  const k1 = await st();
  ok('Shift+F9 shows the field codes: "{ PAGE }" in place of the result, in the body and the footer; View > Field codes ticked',
    !k0.body.includes('{ PAGE }') && k1.f && k1.f.text === '{ PAGE }' && /\{ PAGE \}/.test(k1.body) && /\{ PAGE \}/.test(k1.low)
      && !k0.ticked && k1.ticked, { k0, k1 });
  ok('... display only: the document unchanged, no undo step (same state)', k1.text === k0.text && k1.stateId === k0.stateId, { k0, k1 });
  ok('... the menu item shows the key Shift+F9', /F9/.test(k1.key), k1.key);
  const shaded = await ev(async () => { const d = window.__doc('Flds'); const f = window.__fld(d);
    d.view.setSelection({ id: f.id, off: f.e + 1 }); await window.__frames(2); return window.__shaded(d); });
  ok('... with the caret at the code (When selected): the code shaded', shaded > 0.8, shaded);

  // ------------------------------------------------ saved with the codes shown: the file as opened
  const parts = await ev(async () => Array.from(await window.__doc('Flds').saveBytes()));
  const [x, y, z] = await Promise.all([files.Flds, parts, before].map((q) => readZip(new Uint8Array(q))));
  const has = (m, n) => [...m].every(([k, v]) => { const u = n.get(k); return u && u.length === v.length && u.every((q, i) => q === v[i]); });
  const kept = new Map([...x].filter(([k]) => /footer1|^_rels/.test(k)));
  ok('saved in the codes view: every part byte for byte as saved showing the results; the footer (its PAGE field) and the'
    + ' package relationships byte for byte as in the file opened', kept.size === 2 && has(z, y) && has(y, z) && has(kept, y),
  { kept: [...kept.keys()], zy: has(z, y), yz: has(y, z), ky: has(kept, y) });

  await ev(async () => { const d = window.__doc('Flds'); d.win.bringToFront(); d.dw.view.focus(); await window.__frames(2); });
  await press('Shift+F9');
  const k2 = await st();
  ok('Shift+F9 again: the result again ("1"), unticked', k2.f && k2.f.text === '1' && !/\{ PAGE \}/.test(k2.body) && !k2.ticked, k2);

  // ------------------------------------------------ F9 is still Redo (R2)
  await ev(async () => { const d = window.__doc('Flds'); d.view.setSelection({ id: d.dw.L.items[1].id, off: 0 });
    d.dw.view.focus(); await window.__frames(2); });
  const w0 = await ev(() => window.__doc('Flds').text[1]);
  await page.keyboard.type('zebra ');
  await settle();
  const w1 = await ev(() => window.__doc('Flds').text[1]);
  await press('F8');
  const w2 = await ev(() => window.__doc('Flds').text[1]);
  await press('F9');
  const w3 = await ev(() => window.__doc('Flds').text[1]);
  ok('F9 still redoes: a word typed, undone with F8, comes back with F9', w1 === 'zebra ' + w0 && w2 === w0 && w3 === w1, { w0, w1, w2, w3 });

  await ev(() => { const d = window.__doc('Flds'); d.d.markSaved(); d.dw.close(); });

  // ------------------------------------------------ a short document: paginated in its first paint (P8 fix I1)
  const sh = await ev(async () => {
    const d = await window.__open('Short');
    d.win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(4);
    d.win.bringToFront();
    await window.__frames(2);
    const L = d.dw.L, P = L.place.pages;
    const texts = (k) => L.items[k].lines.flatMap((l) => l.items).filter((y) => y.field).map((y) => y.text);
    const top = (await window.__drawn(d)).join(' ');
    const c = L.caretRect({ id: L.items[1].id, off: 0 });
    d.win.scrollTo(0, Math.max(0, Math.round(c.y - 100)));
    await window.__frames(2);
    const drawn = (await window.__drawn(d)).join(' ');
    return { top, done: !!(P && P.done), count: P && P.count, one: texts(0), two: texts(1), drawn,
      stored: d.d.doc.sections[0].blocks.map((b) => b.text.replace(/\ufffc/g, '#')) };
  });
  ok('a 2-page document paginated in its first paint: the body shows "Page 1 of 2", on page 2 "Page 2 of 2" and'
    + ' PAGE \\* roman "ii"; the stored results unchanged', sh.done && sh.count === 2 && JSON.stringify(sh.one) === '["1","2"]'
    && JSON.stringify(sh.two) === '["2","2","ii"]' && /\b1 +of +2\b/.test(sh.top) && /\b2 +of +2\b.*\bii\b/.test(sh.drawn)
    && sh.stored[0].startsWith('Page ###1# of ###1#') && sh.stored[1] === 'Page ###1# of ###1# roman ###1#', sh);
  await ev(() => { const d = window.__doc('Short'); d.d.markSaved(); d.dw.close(); });

  // ------------------------------------------------ Edit > Update field, Update all fields (P9.1, D19)
  const u0 = await ev(async () => {
    const d = await window.__open('Upd');
    d.win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    window.__beepReal = beep;
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    /** Edit menu item `text` of d's window. */
    window.__edit = (d, text) => d.win.menu({}).items.find((i) => i.text === 'Edit').submenu().items.find((i) => i.text === text);
    window.__upd = (d) => ({ texts: d.d.doc.sections[0].blocks.slice(0, 4).map((b) => b.text.replace(/￼/g, '#')),
      foot: [...d.d.doc.stories.values()][0].blocks[0].text.replace(/￼/g, '#'), depth: d.d.undoDepth, beeps: window.__beeps,
      stateId: d.d.stateId });
    d.view.setSelection({ id: d.dw.L.items[3].id, off: 2 });
    const items = ['Update field', 'Update all fields'].map((t) => { const it = window.__edit(d, t); return it && { key: it.key || '',
      shaded: typeof it.shaded === 'function' ? it.shaded() : !!it.shaded }; });
    const a = window.__upd(d);
    window.__edit(d, 'Update field').action();
    await window.__frames(3);
    return { items, a, b: window.__upd(d) };
  });
  ok('Edit > Update field and Update all fields: no key shown (F9 stays Redo), not shaded',
    u0.items.every((x) => x && !x.key && !x.shaded), u0.items);
  ok('... Update field in plain text: a beep, nothing changed, no step', u0.b.beeps === u0.a.beeps + 1
    && u0.b.depth === u0.a.depth && u0.b.stateId === u0.a.stateId, u0);
  const u1 = await ev(async () => {
    const d = window.__doc('Upd'), L = d.dw.L, it = L.items[2];
    const x = it.lines.flatMap((l) => l.items).find((y) => y.field);
    d.view.setSelection({ id: it.id, off: x.field.e + 1 });
    window.__edit(d, 'Update field').action();
    await window.__frames(3);
    return { shown: x.text, u: window.__upd(d) };
  });
  ok('... with the caret after the body\'s PAGE field on page 3 (shown 3, stored 1): stores 3, one undo step; DATE and the'
    + ' locked PAGE untouched', u1.shown === '3' && u1.u.texts[2] === 'Page ###3# date ###01/01/2000# locked ###1#'
    && u1.u.depth === u0.b.depth + 1 && u1.u.beeps === u0.b.beeps, u1);
  await ev(async () => { const d = window.__doc('Upd'); d.win.bringToFront(); d.dw.view.focus(); await window.__frames(2); });
  await press('F8');
  const u2 = await ev(() => window.__upd(window.__doc('Upd')));
  ok('... F8 undoes it: stored 1 again', u2.texts[2] === 'Page ###1# date ###01/01/2000# locked ###1#', u2);
  const u3 = await ev(async () => {
    const d = window.__doc('Upd'), n = new Date(), two = (k) => String(k).padStart(2, '0');
    window.__edit(d, 'Update all fields').action();
    await window.__frames(3);
    return { u: window.__upd(d), today: `${two(n.getDate())}/${two(n.getMonth() + 1)}/${n.getFullYear()}` };
  });
  ok('Update all fields: PAGE 3, DATE today, the locked PAGE still 1; one step; the footer not (body only)',
    u3.u.texts[2] === `Page ###3# date ###${u3.today}# locked ###1#` && u3.u.depth === u2.depth + 1
      && u3.u.foot === 'Foot ###1#', u3);
  const fc = await ev(async () => {
    const d = window.__doc('Upd'), L = d.dw.L, P = L.place.pages;
    P.finish();
    const pg = P.at(2), rc = L.place.sheet.rect(pg), geo = L.geom(pg.s), w = d.win, z = d.view.zoom, t = L.top;
    const x = rc.x + geo.mar.left + 40, y = rc.y + rc.h - geo.mar.footer - 8;
    const q = { x: x * z, y: t + (y - t) * z };
    w.scrollTo(Math.max(0, Math.round(q.x - w.w / 2)), Math.max(0, Math.round(q.y - w.h / 2)));
    await window.__frames(2);
    const s = w.workToScreen(q.x, q.y), b = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
    return { x: b.left + s.x * k, y: b.top + s.y * k };
  });
  await page.mouse.dblclick(fc.x, fc.y);
  await settle();
  const u4 = await ev(async () => {
    const d = window.__doc('Upd'), m = d.dw.view.hdr, before = window.__upd(d);
    const all = window.__edit(d, 'Update all fields');
    const shaded = typeof all.shaded === 'function' ? all.shaded() : !!all.shaded;
    window.__edit(d, 'Update field').action();
    await window.__frames(3);
    return { mode: m && { kind: m.kind, i: m.i }, shaded, before, u: window.__upd(d) };
  });
  ok('in the footer mode on page 3: Update field stores the footer\'s 3 (one step), the body unchanged; Update all fields'
    + ' shaded', u4.mode && u4.mode.kind === 'ftr' && u4.mode.i === 2 && u4.u.foot === 'Foot ###3#' && u4.shaded
      && u4.u.depth === u4.before.depth + 1 && JSON.stringify(u4.u.texts) === JSON.stringify(u4.before.texts), u4);
  await press('Escape');
  const u5 = await ev(async () => {
    const d = window.__doc('Upd');
    while (d.d.canUndo) d.d.undo();
    await window.__frames(3);
    d.win.menu({}).items.find((i) => i.text === 'View').submenu().items.find((i) => i.text === 'Draft').action();
    await window.__frames(3);
    const L = d.dw.L, it = L.items[2], x = it.lines.flatMap((l) => l.items).find((y) => y.field);
    d.view.setSelection({ id: it.id, off: x.field.e + 1 });
    const before = window.__upd(d);
    window.__edit(d, 'Update field').action();
    await window.__frames(3);
    return { view: d.viewName, mode: !!d.dw.view.hdr, before, u: window.__upd(d) };
  });
  ok('in Draft (no pages shown): Update field still stores the page the field is on (3)', u5.view === 'draft' && !u5.mode
    && u5.before.texts[2].startsWith('Page ###1#') && u5.u.texts[2].startsWith('Page ###3#'), u5);
  await ev(() => { os.wimp.beep = window.__beepReal; const d = window.__doc('Upd'); d.d.markSaved(); d.dw.close(); });
  // ------------------------------------------------ Insert > Page number in a footer; the Field box (P9.2, D19)
  const i0 = await ev(async () => {
    const d = await window.__open('Ins');
    d.win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    // (the Draft chosen above is remembered: back to Print layout)
    if (d.viewName !== 'print') {
      d.win.menu({}).items.find((i) => i.text === 'View').submenu().items.find((i) => i.text === 'Print layout').action();
      await window.__frames(3);
    }
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    window.__beepReal = beep;
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    window.__ins = (d, text) => d.win.menu({}).items.find((i) => i.text === 'Insert').submenu().items.find((i) => i.text === text);
    window.__st = (d) => ({ depth: d.d.undoDepth, beeps: window.__beeps, body: d.d.doc.sections[0].blocks.map((b) => b.text.replace(/￼/g, '#')),
      foot: [...d.d.doc.stories.values()][0].blocks[0].text.replace(/￼/g, '#') });
    /** The texts drawn in page i's footer (after a redraw of it). */
    window.__footOn = async (d, i) => {
      const w = d.win, L = d.dw.L, pg = L.place.pages.at(i), rc = L.place.sheet.rect(pg), k = w._canvas.width / w.w;
      w.scrollTo(0, rc.y + rc.h - w.h + 4);
      await window.__frames(2);
      const proto = CanvasRenderingContext2D.prototype, real = proto.fillText, seen = [];
      proto.fillText = function (t, x, y, ...a) {
        if (this.canvas === w._canvas) { const m = this.getTransform(); seen.push([String(t), (m.b * x + m.d * y + m.f) / k + w.scrollY]); }
        return real.call(this, t, x, y, ...a);
      };
      try { w.invalidate(); await window.__frames(2); } finally { proto.fillText = real; }
      const bot = rc.y + pg.bodyTop + pg.frameH;
      return seen.filter(([, y]) => y > bot && y < rc.y + rc.h).map(([t]) => t).join(' ');
    };
    const L = d.dw.L, P = L.place.pages;
    P.finish();
    const pg = P.at(0), rc = L.place.sheet.rect(pg), geo = L.geom(pg.s), w = d.win, z = d.view.zoom, t = L.top;
    const x = rc.x + geo.mar.left + 20, y = rc.y + rc.h - geo.mar.footer - 8;
    const q = { x: x * z, y: t + (y - t) * z };
    w.scrollTo(Math.max(0, Math.round(q.x - w.w / 2)), Math.max(0, Math.round(q.y - w.h / 2)));
    d.win.bringToFront();
    await window.__frames(2);
    const s = w.workToScreen(q.x, q.y), b = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
    return { count: P.count, x: b.left + s.x * k, y: b.top + s.y * k };
  });
  await page.mouse.dblclick(i0.x, i0.y);
  await settle();
  await press('End');
  const i1 = await ev(async () => {
    const d = window.__doc('Ins'), m = d.dw.view.hdr, a = window.__st(d);
    const it = window.__ins(d, 'Page number');
    const shaded = typeof it.shaded === 'function' ? it.shaded() : !!it.shaded;
    it.action();
    await window.__frames(3);
    return { mode: m && m.kind, shaded, a, b: window.__st(d), items: d.win.menu({}).items.find((i) => i.text === 'Insert').submenu().items.map((i) => i.text) };
  });
  ok('Insert menu: Page number, Number of pages, Date, Time, Field... after Bookmark...',
    JSON.stringify(i1.items.slice(-6)) === JSON.stringify(['Bookmark...', 'Page number', 'Number of pages', 'Date', 'Time', 'Field...']), i1.items);
  ok('in the footer mode, Insert > Page number (not shaded) puts a PAGE field after "Foot " in one undo step, the body unchanged',
    i1.mode === 'ftr' && !i1.shaded && i1.b.foot === 'Foot ###1#' && i1.b.depth === i1.a.depth + 1
      && JSON.stringify(i1.b.body) === JSON.stringify(i1.a.body), i1);
  await press('Escape');
  const i2 = await ev(async () => {
    const d = window.__doc('Ins'), out = [];
    d.dw.L.place.pages.finish();
    for (let i = 0; i < 3; i++) out.push(await window.__footOn(d, i));
    return { mode: !!d.dw.view.hdr, out };
  });
  ok('... pages 1, 2 and 3 show "Foot 1", "Foot 2", "Foot 3"', !i2.mode && /Foot\s*1\b/.test(i2.out[0]) && /Foot\s*2\b/.test(i2.out[1])
    && /Foot\s*3\b/.test(i2.out[2]), i2);
  const x0 = await ev(async () => {
    const d = window.__doc('Ins');
    d.view.setSelection({ id: d.dw.L.items[2].id, off: 5 });
    d.win.bringToFront();
    d.dw.view.focus();
    await window.__frames(2);
    window.__ins(d, 'Field...').action();
    await window.__frames(3);
    const api = window.__word().word.dialog({ key: 'field:' + d.docKey, rows: [] }), bw = api.win;
    const a = window.__st(d);
    return { open: bw.isOpen, w: bw.w, title: bw.title, code: api.get('code'), name: api.get('name'), a };
  });
  ok('Insert > Field... opens the Field box, 3.6 inches wide, PAGE\'s code shown', x0.open && x0.w >= 648 && x0.name === 'PAGE'
    && x0.code === 'PAGE \\* MERGEFORMAT', x0);
  await ev(() => { const d = window.__doc('Ins'); window.__word().word.dialog({ key: 'field:' + d.docKey, rows: [] }).set('code', ''); });
  await press('Enter');
  const x1 = await ev(() => {
    const d = window.__doc('Ins'), bw = d.dw.boxes.get('field');
    return { open: !!bw && bw.isOpen, msg: bw ? (bw.iconByName('msg').text + ' ' + bw.iconByName('msg2').text).trim() : '', st: window.__st(d) };
  });
  ok('... an empty code: refused with a beep and a message, the box kept, nothing changed', x1.open && x1.st.beeps === x0.a.beeps + 1
    && /field code/i.test(x1.msg) && x1.st.depth === x0.a.depth && JSON.stringify(x1.st.body) === JSON.stringify(x0.a.body), x1);
  await press('Escape');
  const x2 = await ev(() => { const d = window.__doc('Ins'), bw = d.dw.boxes.get('field'); return { open: !!bw && bw.isOpen, st: window.__st(d) }; });
  ok('... Escape: the box gone, nothing changed', !x2.open && x2.st.depth === x0.a.depth && x2.st.beeps === x1.st.beeps, x2);
  await ev(async () => { const d = window.__doc('Ins'); window.__ins(d, 'Field...').action(); await window.__frames(3);
    window.__word().word.dialog({ key: 'field:' + d.docKey, rows: [] }).set('code', 'NUMPAGES'); });
  await press('Enter');
  const x3 = await ev(() => { const d = window.__doc('Ins'), bw = d.dw.boxes.get('field'); return { open: !!bw && bw.isOpen, st: window.__st(d) }; });
  ok('... a code typed and Return: the field put in at the caret, filled at once (3 pages), one step, the box gone',
    !x3.open && x3.st.body[2] === 'three###3#' && x3.st.depth === x0.a.depth + 1, x3);
  // ------------------------------------------------ a stale OK keeps the code typed (P9 fix M2)
  const y0 = await ev(async () => {
    const d = window.__doc('Ins'), ids = d.dw.L.items.map((x) => x.id);
    d.view.setSelection({ id: ids[0], off: 3 });
    window.__ins(d, 'Field...').action();
    await window.__frames(3);
    const api = window.__word().word.dialog({ key: 'field:' + d.docKey, rows: [] });
    api.set('code', 'AUTHOR \\* Upper');
    d.view.setSelection({ id: ids[1], off: 1 });
    await window.__frames(2);
    return window.__st(d);
  });
  await press('Enter');
  const y1 = await ev(() => {
    const d = window.__doc('Ins'), bw = d.dw.boxes.get('field');
    const api = window.__word().word.dialog({ key: 'field:' + d.docKey, rows: [] });
    return { open: !!bw && bw.isOpen, code: api.get('code'), msg: (bw.iconByName('msg').text + ' ' + bw.iconByName('msg2').text).trim(),
      st: window.__st(d) };
  });
  ok('the document changed under the Field box: OK beeps, says so and keeps the code typed (AUTHOR \\* Upper)',
    y1.open && y1.code === 'AUTHOR \\* Upper' && y1.st.beeps === y0.beeps + 1 && /changed/.test(y1.msg) && y1.st.depth === y0.depth, y1);
  await press('Enter');
  const y2 = await ev(() => { const d = window.__doc('Ins'), bw = d.dw.boxes.get('field');
    return { open: !!bw && bw.isOpen, st: window.__st(d), instr: d.d.doc.sections[0].blocks[1].inlines };
  });
  ok('... a second OK puts that field in at the new caret (one step)', !y2.open && /^t###[^#]*#wo#$/.test(y2.st.body[1])
    && y2.st.depth === y0.depth + 1 && JSON.stringify(y2.instr).includes('AUTHOR \\\\* Upper'), y2);

  // ------------------------------------------------ shown = stored for Date and Time (P9 fix I2)
  const tm = await ev(async () => {
    const d = window.__doc('Ins'), id = d.dw.L.items[2].id;
    /** The window shown as opened at 14:05 on 1 Jan 2000 (its clock). */
    const old = () => { d.dw.fields = { ...d.dw.fields, now: new Date(2000, 0, 1, 14, 5) }; d.dw.relayout(); };
    /** The last field of paragraph 2: as shown, as stored. */
    const last = () => {
      const it = d.dw.L.byId.get(id), xs = it.lines.flatMap((l) => l.items).filter((y) => y.field);
      const m = d.d.doc.sections[0].blocks[2].text.match(/\ufffc([^\ufffc]*)\ufffc$/);
      return { shown: xs.length ? xs[xs.length - 1].text : null, stored: m && m[1], n: xs.length };
    };
    old();
    const t = d.d.doc.sections[0].blocks[2].text.length;
    d.view.setSelection({ id, off: t });
    window.__ins(d, 'Time').action();
    await window.__frames(3);
    const a = last();
    old();
    const b0 = last();
    d.view.setSelection({ id, off: d.d.doc.sections[0].blocks[2].text.length });
    await window.__frames(1);
    window.__edit = window.__edit || ((d, text) => d.win.menu({}).items.find((i) => i.text === 'Edit').submenu().items.find((i) => i.text === text));
    window.__edit(d, 'Update field').action();
    await window.__frames(3);
    return { a, b0, b: last() };
  });
  ok('Insert > Time with the window opened long ago: the time shown is the time stored, at once',
    tm.a.n === 2 && /^\d\d?:\d\d/.test(tm.a.stored || '') && tm.a.shown === tm.a.stored, tm);
  ok('... Update field on it: the window shows the time the update stores (not when it was opened)',
    tm.b0.shown === '14:05' && tm.b.shown === tm.b.stored && tm.b.shown !== '14:05', tm);
  await ev(() => { os.wimp.beep = window.__beepReal; const d = window.__doc('Ins'); d.d.markSaved(); d.dw.close(); });
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
