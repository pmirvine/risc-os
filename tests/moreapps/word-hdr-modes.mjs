// !Letters' header and footer mode kept by the commands run in it
// (Batch D final fix A, F1-I1, F3-I1), in the real desktop. Part 1
// (F1-I1): a document whose
// second section, continuous and in two columns, starts a page (its
// pages first worked out without the column widths, then put right by
// the column passes) and whose body holds PAGE, NUMPAGES and DATE
// fields. On that page's header, with the window's clock made slow
// (every performance.now() 30 ms on: the passes after an edit run out
// of time at once, so the pages stay unsettled until the slices
// finish them), each field command run in the mode keeps the mode on
// that page and the caret in the header's story: Update field, Update
// all fields (refused there), Insert > Page number, Date, Time, the
// Field box's OK and Shift+F9 (View > Field codes); after the slices
// the mode is still on that page. The reviewer's seed (Update all,
// Undo, Update field, the header entered on that page, Update field)
// keeps the mode too. The mode left while a command's layout is made
// (forced: the window's rebuild leaves it) drops the story's
// selection: the caret back in the body, typing goes there. Escape
// puts the caret back in the body: the selection names a body
// paragraph, and typing goes there. Part 2 (F3-I1): Format > Page
// setup..., Layout..., Columns... and Line numbers... (from Layout's
// button) opened in the body and left open while View > Header and
// footer enters the mode: OK there is refused with a beep and the
// message "Leave the header or footer first...", again on a second
// OK, with no error box and nothing changed (no undo step); back in
// the body, OK takes the box. Part 3 (final fix B): in a footer the
// Footer item's menu and View > Header and footer options are titled
// Footer (Header in a header), and the View and Insert items' help is
// current. Needs the disc built by
// tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { p, r } from './build-docx.mjs';
import { wordHf, BODY } from './hf-fixtures.mjs';
import { fld } from './field-fixtures.mjs';

const MAR = '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"'
  + ' w:header="708" w:footer="708" w:gutter="0"/>';
const FLDS = (i) => p(r(i + ' page ') + fld(' PAGE ', '1') + r(' of ') + fld(' NUMPAGES ', '1') + r(' on ')
  + fld(' DATE ', '01/01/2000') + r(' and more words to fill the line out a little'));
const files = {
  Box: await wordHf({ body: BODY(12), default: { hdr: p(r('Box head')) } }),
  Cols: await wordHf({ default: { hdr: p(r('Head ') + fld(' PAGE ', '1')) },
    body: BODY(22) + p(r('end of one'), '<w:sectPr><w:headerReference w:type="default" r:id="rIdH1"/>' + MAR + '</w:sectPr>')
      + Array.from({ length: 30 }, (_, i) => FLDS(i)).join('')
      + p(r('end of two'), '<w:sectPr><w:type w:val="continuous"/>' + MAR + '<w:cols w:num="2" w:space="720"/></w:sectPr>')
      + BODY(10) }),
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
  await ev(async (files) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
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
    window.__beeps = 0;
    window.__beepReal = os.wimp.beep;
    os.wimp.beep = (...a) => { window.__beeps++; return window.__beepReal?.apply(os.wimp, a); };
    /** Menu item `text` of submenu `menu` of d's window (a path: [menu, sub, ...]). */
    window.__menu = (d, ...path) => {
      let items = d.win.menu({}).items, it = null;
      for (const t of path) {
        it = items.find((i) => i.text === t);
        if (!it) return null;
        items = it.submenu ? it.submenu().items : [];
      }
      return it;
    };
    window.__run = (d, ...path) => { const it = window.__menu(d, ...path); it.action(it); };
    /** Run the slices until the pages are done and no pass is due. */
    window.__settled = async (d) => {
      for (let k = 0; k < 600; k++) {
        const dw = d.dw;
        if (dw.pages && dw.pages.done && !dw.colDue && !dw.wrapDue && !dw.raf) return true;
        await window.__frames(1);
      }
      return false;
    };
    /** The clock made slow while fn runs (each performance.now() 30 ms on). */
    window.__slow = async (fn) => {
      const real = performance.now.bind(performance);
      let t = real();
      performance.now = () => (t += 30);
      try { return await fn(); } finally { performance.now = real; }
    };
    /** Where d's window is: the mode, its page, the selection's paragraph in the body or in the story. */
    window.__where = (d) => {
      const v = d.dw.view, m = v.hdr, sel = v.sel, id = sel && sel.head.id;
      const body = d.d.doc.sections.flatMap((s) => s.blocks).some((b) => b.id === id);
      const st = m && d.d.doc.stories.get(m.part);
      const inStory = !!(st && st.blocks.some((b) => b.id === id));
      return { mode: m ? m.kind + ' ' + m.i : null, body, inStory, depth: d.d.undoDepth ?? null, beeps: window.__beeps };
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
  }, files);

  // ------------------------------------------------ part 1: field commands in the mode
  const enter = () => ev(async () => {
    const d = window.__doc('Cols');
    await window.__settled(d);
    if (d.dw.view.hdr) d.toggleHdr?.();
    d.dw.view.hdr && window.__word().word.docs;
    const h = window.__word().word.docs.find((x) => x.leaf === 'Cols');
    h.enterHdr(window.__hp, 'hdr');
    await window.__frames(2);
    return window.__where(d);
  });
  const s0 = await ev(async () => {
    const d = await window.__open('Cols');
    d.win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    const settled = await window.__settled(d);
    const P = d.dw.pages, b = d.d.doc.sections[1].blocks[0];
    window.__hp = P.ofPos({ id: b.id, off: 0 });
    return { view: d.viewName, settled, n: P.count, secs: P.list.map((pg) => pg.s).join(''), hp: window.__hp };
  });
  ok('the document opens in Print layout; the two-column section starts on a page after the first', s0.view === 'print'
    && s0.settled && s0.hp >= 1, s0);
  const HP = 'hdr ' + s0.hp;
  const e0 = await enter();
  ok('... the header entered on that page, the caret in its story', e0.mode === 'hdr ' + s0.hp && e0.inStory, e0);

  for (const name of ['Update field', 'Insert > Page number', 'Insert > Date', 'Insert > Time']) {
    const c = await ev(async (name) => {
      const CMDS = {
        'Update field': (d) => window.__run(d, 'Edit', 'Update field'),
        'Insert > Page number': (d) => window.__run(d, 'Insert', 'Page number'),
        'Insert > Date': (d) => window.__run(d, 'Insert', 'Date'),
        'Insert > Time': (d) => window.__run(d, 'Insert', 'Time'),
      };
      const d = window.__doc('Cols');
      const a = window.__where(d);
      await window.__slow(async () => { CMDS[name](d); await window.__frames(1); });
      const b = window.__where(d);
      const settled = await window.__settled(d);
      return { a, b, settled, c: window.__where(d) };
    }, name);
    ok(`${name} in the header of the page where the columns start with a slow clock: the mode kept on that page, the caret in the story (also once settled)`,
      c.b.mode === HP && c.b.inStory && c.settled && c.c.mode === HP && c.c.inStory, c);
  }
  const ua = await ev(async () => {
    const d = window.__doc('Cols'), a = window.__where(d);
    await window.__slow(async () => { window.__run(d, 'Edit', 'Update all fields'); await window.__frames(1); });
    await window.__settled(d);
    return { a, b: window.__where(d) };
  });
  ok('Update all fields in the mode: refused (nothing changed), the mode kept', ua.b.mode === HP && ua.b.inStory
    && ua.b.depth === ua.a.depth, ua);
  // the Field box's OK
  const fb = await ev(async () => {
    const d = window.__doc('Cols'), a = window.__where(d);
    window.__run(d, 'Insert', 'Field...');
    await window.__frames(3);
    const api = window.__word().word.dialog({ key: 'field:' + d.docKey, rows: [] });
    api.set('code', 'NUMPAGES');
    return { a, open: api.win.isOpen };
  });
  await page.keyboard.press('Enter');
  const fb2 = await ev(async () => {
    const d = window.__doc('Cols');
    const b = window.__where(d);
    await window.__settled(d);
    return { b, c: window.__where(d) };
  });
  ok('the Field box\'s OK in the mode: the field put in the header (one step), the mode kept on that page', fb.open
    && fb2.b.mode === HP && fb2.b.inStory && fb2.c.mode === HP && fb2.c.depth === fb.a.depth + 1, { fb, fb2 });
  // Shift+F9 with a slow clock
  await ev(async () => { const d = window.__doc('Cols'); d.win.bringToFront(); d.dw.view.focus(); await window.__frames(2); });
  const sf0 = await ev(() => { const d = window.__doc('Cols'); window.__slowOn = true; return window.__where(d); });
  await ev(() => {
    const real = performance.now.bind(performance);
    let t = real();
    window.__realNow = real;
    performance.now = () => (t += 30);
  });
  await page.keyboard.press('Shift+F9');
  await ev(async () => { await window.__frames(1); performance.now = window.__realNow; });
  const sf1 = await ev(async () => {
    const d = window.__doc('Cols'), b = window.__where(d);
    await window.__settled(d);
    return { b, c: window.__where(d), codes: !!d.dw.L.fields?.codes };
  });
  ok('Shift+F9 in the mode with a slow clock: field codes shown, the mode kept on that page', sf1.codes && sf1.b.mode === HP
    && sf1.b.inStory && sf1.c.mode === HP, { sf0, sf1 });
  await page.keyboard.press('Shift+F9');
  await settle();
  // the reviewer's seed: Update all, Undo, Update field, enter page 3, Update field
  const seed = await ev(async () => {
    const d = window.__doc('Cols'), h = window.__word().word.docs.find((x) => x.leaf === 'Cols');
    h.toggleHdr();
    await window.__frames(2);
    const out = [window.__where(d)];
    while (d.d.canUndo) d.d.undo();
    await window.__settled(d);
    d.view.setSelection({ id: d.d.doc.sections[1].blocks[0].id, off: 3 });
    window.__run(d, 'Edit', 'Update all fields');
    await window.__frames(2);
    d.d.undo();
    await window.__frames(2);
    window.__run(d, 'Edit', 'Update field');
    await window.__frames(2);
    h.enterHdr(window.__hp, 'hdr');
    await window.__frames(2);
    out.push(window.__where(d));
    await window.__slow(async () => { window.__run(d, 'Edit', 'Update field'); await window.__frames(1); });
    out.push(window.__where(d));
    await window.__settled(d);
    out.push(window.__where(d));
    return out;
  });
  ok('the reviewer\'s seed (Update all, Undo, Update field, that page\'s header, Update field): the mode kept, the caret in the story',
    seed[0].mode === null && seed[1].mode === HP && seed[2].mode === HP && seed[2].inStory && seed[3].mode === HP
      && seed[3].inStory, seed);
  // the mode left under the command (the pages laid out after it show the story on no page): the story's selection dropped
  const lost = await ev(async () => {
    const d = window.__doc('Cols'), dw = d.dw, real = dw.rebuild;
    dw.rebuild = function () { dw.rebuild = real; window.__word().word.docs.find((x) => x.leaf === 'Cols').toggleHdr(); return real.call(this); };
    const a = window.__where(d);
    try { window.__run(d, 'Edit', 'Update field'); await window.__frames(3); } finally { dw.rebuild = real; }
    const b = window.__where(d), depth = d.d.undoDepth, beeps = window.__beeps;
    d.view.type('Z');
    await window.__frames(2);
    const id = dw.view.sel && dw.view.sel.head.id;
    const txt = d.d.doc.sections.flatMap((s) => s.blocks).find((x) => x.id === id)?.text || '';
    return { a, b, typed: txt.includes('Z'), steps: d.d.undoDepth - depth, beeps: window.__beeps - beeps };
  });
  ok('the mode left while Update field lays the pages out: the header\'s selection dropped, the caret in the body; typing goes there',
    lost.a.mode === HP && lost.b.mode === null && lost.b.body && !lost.b.inStory && lost.typed && lost.steps === 1 && !lost.beeps, lost);
  await ev(async () => { const d = window.__doc('Cols'); d.d.undo(); await window.__frames(2);
    window.__word().word.docs.find((x) => x.leaf === 'Cols').enterHdr(window.__hp, 'hdr'); await window.__frames(2); });
  await press('Escape');
  const back = await ev(async () => {
    const d = window.__doc('Cols'), a = window.__where(d), t0 = d.d.undoDepth;
    d.view.type('Q');
    await window.__frames(2);
    const id = d.dw.view.sel.head.id, txt = d.d.doc.sections.flatMap((s) => s.blocks).find((b) => b.id === id)?.text;
    return { a, typed: !!txt && txt.includes('Q') };
  });
  ok('Escape: back in the body, the selection in a body paragraph; typing goes there', back.a.mode === null && back.a.body
    && !back.a.inStory && back.typed, back);
  await ev(() => { const d = window.__doc('Cols'); while (d.d.canUndo) d.d.undo(); d.d.markSaved(); d.dw.close(); });

  // ------------------------------------------------ part 2: section boxes left open into the mode
  const client = async (q) => { if (q) { await page.mouse.click(q.x, q.y); await settle(); } };
  const icon = (n, name) => ev(([n, name]) => {
    const d = window.__doc('Box');
    if (!d.dw.boxes.has(n)) return null;              // (gone: no dialog made for the asking)
    const w = window.__word().word.dialog({ key: n + ':' + d.docKey, rows: [] }).win;
    const b = w.iconByName(name).bbox, s = w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
    return { x: rc.left + s.x * k, y: rc.top + s.y * k };
  }, [n, name]);
  const state = (n) => ev((n) => {
    const d = window.__doc('Box'), has = d.dw.boxes.has(n);
    const api = has ? window.__word().word.dialog({ key: n + ':' + d.docKey, rows: [] }) : null;
    return { open: !!api && api.isOpen, msg: api ? api.get('msg') : null, beeps: window.__beeps, depth: d.d.undoDepth,
      msgs: window.__msgs.length, mode: !!d.dw.view.hdr };
  }, n);
  for (const [box, n] of [['Page setup...', 'page'], ['Layout...', 'layout'], ['Columns...', 'columns'], ['Line numbers...', 'linenums']]) {
    await ev(async () => {
      const d = window.__doc('Box') || await window.__open('Box');
      d.win.open({ x: 60, y: 40, w: 1000, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(3);
      await window.__settled(d);
      d.view.setSelection({ id: d.d.doc.sections[0].blocks[1].id, off: 2 });
      await window.__frames(1);
    });
    await ev(async (box) => {
      const d = window.__doc('Box'), it = window.__menu(d, 'Format', box === 'Line numbers...' ? 'Layout...' : box);
      it.action(it);
      await window.__frames(3);
    }, box);
    if (n === 'linenums') {
      await client(await icon('layout', 'linenums'));
      await page.waitForFunction(() => window.__doc('Box').dw.boxes.has('linenums'));
    }
    await ev(async () => {
      const d = window.__doc('Box');
      window.__word().word.docs.find((x) => x.leaf === 'Box').toggleHdr();
      await window.__frames(2);
    });
    const s0 = await state(n);
    await client(await icon(n, 'button:OK'));
    const s1 = await state(n);
    await client(await icon(n, 'button:OK'));
    const s2 = await state(n);
    ok(`${box} open into the header mode: OK refused twice with a beep and the message, no error box, nothing changed`,
      s0.mode && s0.open && s1.open && s2.open && s1.beeps === s0.beeps + 1 && s2.beeps === s1.beeps + 1
        && /header or footer/i.test(s2.msg || '') && s2.msgs === s0.msgs && s2.depth === s0.depth && s2.mode, { s0, s1, s2 });
    await ev(async () => {
      window.__word().word.docs.find((x) => x.leaf === 'Box').toggleHdr();
      await window.__frames(2);
    });
    if (n !== 'columns') {
      await client(await icon(n, 'button:OK'));
      const s3 = await state(n);
      ok(`... back in the body: OK takes the box (no beep, no message)`, !s3.open && s3.beeps === s2.beeps && s3.msgs === s0.msgs
        && !s3.mode, s3);
    } else {
      await client(await icon(n, 'button:Cancel'));
    }
    await ev(async () => {
      const d = window.__doc('Box');
      for (const k of ['layout', 'linenums', 'page', 'columns']) {
        if (d.dw.boxes.has(k)) window.__word().word.dialog({ key: k + ':' + d.docKey, rows: [] }).close();
      }
      while (d.d.canUndo) d.d.undo();
      await window.__frames(2);
    });
  }

  // ------------------------------------------------ part 3: the mode's menus (final fix B, review 3 M14, M15)
  const mt = await ev(async () => {
    const d = window.__doc('Box'), h = window.__word().word.docs.find((x) => x.leaf === 'Box');
    await window.__settled(d);
    if (d.dw.view.hdr) h.toggleHdr();
    const help = (t) => window.__menu(d, t)?.help;
    const r = { view: help('View'), insert: help('Insert') };
    const titles = (kind) => {
      h.enterHdr(0, kind);
      const it = window.__menu(d, kind === 'hdr' ? 'Header' : 'Footer');
      const opts = window.__menu(d, 'View', 'Header and footer options');
      const t = { item: it && it.text, sub: it && it.submenu().title, opts: opts && opts.submenu().title };
      h.toggleHdr();
      return t;
    };
    r.hdr = titles('hdr');
    r.ftr = titles('ftr');
    return r;
  });
  ok('the Footer item\'s menu (and View > Header and footer options) is titled Footer in a footer, Header in a header',
    mt.hdr.sub === 'Header' && mt.hdr.opts === 'Header' && mt.ftr.item === 'Footer' && mt.ftr.sub === 'Footer'
    && mt.ftr.opts === 'Footer', mt);
  ok('the View and Insert items\' help names the four views and what Insert puts in',
    /Web layout/.test(mt.view) && /Outline/.test(mt.view) && /header/i.test(mt.view)
    && ['field', 'column break', 'table', 'picture'].every((w) => mt.insert.includes(w)), mt);
  await ev(() => { os.wimp.beep = window.__beepReal; const d = window.__doc('Box'); d.d.markSaved(); d.dw.close(); });
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
