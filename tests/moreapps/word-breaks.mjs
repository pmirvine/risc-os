// !Word's page breaks in the real desktop with real key presses:
// a Word file's page and column breaks are drawn as grey dotted rules
// labelled "Page break" / "Column break" (a lastRenderedPageBreak is
// not); Ctrl-Enter mid-paragraph puts a break there and splits the
// paragraph after it, one undo step (Ctrl-Z, Ctrl-Y, the caret back
// where it was); at a paragraph's end, in an empty paragraph, over a
// selection across paragraphs; Left and Right pass the break in one
// press each; Backspace after it and Delete before it remove it; a
// click on the rule puts the caret at its nearer edge, at 100% and
// 200% (the rule drawn larger there); a selection lights only the
// rule's first few pixels; copy and paste within the document keeps
// the break; a saved copy has <w:br w:type="page"/> in a run and
// reads back with it. Section breaks (Insert > Section break, run
// by its command id and from the menu): an 18 px band
// under the section's last paragraph, a double dotted rule labelled
// "Section break (Next page)" / "(Continuous)"; one undo step; a
// click in the band puts the caret at the end of the paragraph above;
// Delete there removes the break, Ctrl-Z puts it back; saved, the
// copy is in the paragraph and the body sectPr has w:type. The Insert
// menu (after Edit): Page break with Ctrl+Enter (also on a Mac),
// Section break > Next page / Continuous, the Symbol, Special
// character, Hyperlink and Bookmark items (live; Bookmark with
// Ctrl+Shift+F5, on a Mac too); both run from the menu.
// Page break before: a 12 px gap and a dotted rule labelled "Page
// break before", a click in it the paragraph's start. No page
// errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { readDocx } from '../../tools/moreapps/!Word/DocxRead';
import { xmlEntries } from './docx-compare.mjs';

const O = '￼';
const body = [
  p(r('First paragraph text')),
  p(r('Second')),
  p(''),
  p('<w:r><w:lastRenderedPageBreak/><w:t>From Word</w:t></w:r><w:r><w:br w:type="page"/></w:r>'),
  p('<w:r><w:t>Col</w:t><w:br w:type="column"/><w:t>umn</w:t></w:r>'),
  p(r('Last one')),
].join('');
const files = { Br: Array.from(await buildDocx({ 'word/document.xml': documentXml(body) })) };

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(3));
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); await settle(); };

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
    window.__doc = () => window.__word()?.word.docs.find((d) => d.path?.endsWith('.Br'));
    /** Layout -> the window's work area at the document's zoom. */
    window.__ws = (x, y) => {
      const d = window.__doc(), z = d.zoom / 100, t = d.view.layout.top;
      return { x: x * z, y: t + (y - t) * z };
    };
    window.__client = (x, y) => {
      const d = window.__doc(), q = window.__ws(x, y), s = d.win.workToScreen(q.x, q.y);
      const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    /** Pixels of a layout rectangle: grey (the rule), blue (selection), n. */
    window.__scan = (x, y, w, h) => {
      const d = window.__doc(), win = d.win, cv = win._canvas, k = cv.width / win.w;
      const a = window.__ws(x, y), b = window.__ws(x + w, y + h);
      const img = cv.getContext('2d').getImageData(Math.round((a.x - win.scrollX) * k), Math.round((a.y - win.scrollY) * k),
        Math.max(1, Math.round((b.x - a.x) * k)), Math.max(1, Math.round((b.y - a.y) * k)));
      let grey = 0, blue = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        const [R, G, B] = [img.data[i], img.data[i + 1], img.data[i + 2]];
        if (R < 230 && R > 60 && Math.abs(R - G) < 12 && Math.abs(G - B) < 12) grey++;
        if (B > 200 && B - R > 40) blue++;
      }
      return { grey, blue, n: img.data.length / 4 };
    };
    /** The rules of item i: [{x, y, w, h, label, from}] in layout coordinates. */
    window.__rules = (i) => {
      const L = window.__doc().view.layout, it = L.items[i];
      return it.lines.flatMap((ln) => ln.items.filter((x) => x.kind === 'pagebreak').map((x) => ({
        x: L.left + x.x, y: it.y + ln.y, w: x.w, h: ln.h, label: x.label, from: x.from })));
    };
    window.__state = () => {
      const v = window.__doc().view, L = v.layout, s = v.selection, h = s?.head;
      return { lines: v.lines(), depth: v.undoDepth, head: h ? [L.byId.get(h.id).index, h.off] : null,
        anchor: s ? [L.byId.get(s.anchor.id).index, s.anchor.off] : null, msgs: window.__msgs.length };
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Word');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await os.filer.run('RAM::RamDisc0.$.Br');
    for (let i = 0; i < 100 && !window.__doc(); i++) await window.__sleep(50);
    window.__doc().win.open({ x: 60, y: 40, w: 900, h: 600, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    return { s: window.__state(), rules: [0, 1, 2, 3, 4, 5].map((i) => window.__rules(i)) };
  }, files);
  ok('a Word file opens: its page and column breaks are rules labelled "Page break" and "Column break"; no rule for lastRenderedPageBreak',
    same(s0.rules.map((x) => x.map((y) => y.label)), [[], [], [], ['Page break'], ['Column break'], []]) && !s0.s.msgs, s0);
  const drawn = await ev(() => { const [a] = window.__rules(3), [b] = window.__rules(4);
    return { a: window.__scan(a.x, a.y, a.w, a.h), b: window.__scan(b.x, b.y, b.w, b.h) }; });
  ok('... each drawn: grey dots and its label in the line', drawn.a.grey > 60 && drawn.b.grey > 60, drawn);

  const st = () => ev(() => window.__state());
  // (clicks apart by more than a double-click's time)
  const DBL = await ev(() => (os.input.config.doubleClickMs || 500) + 100);
  const caretAt = async (i, off) => {
    const q = await ev(([i, off]) => { const L = window.__doc().view.layout, c = L.caretRect({ id: L.items[i].id, off });
      return window.__client(c.x + 1, c.y + c.h / 2); }, [i, off]);
    await wait(DBL);
    await page.mouse.click(q.x, q.y);
    await wait(60);
    await settle();
  };

  // ---------------------------------------------------- Ctrl-Enter mid-paragraph
  await caretAt(0, 5);
  const d0 = (await st()).depth;
  await press('Control+Enter');
  const a1 = await st();
  const r1 = await ev(() => { const [a] = window.__rules(0); return { a, scan: a && window.__scan(a.x, a.y, a.w, a.h) }; });
  ok('Ctrl-Enter mid-paragraph: the break after "First", the rest a new paragraph, the caret at its start; one undo step',
    a1.lines[0] === 'First' + O && a1.lines[1] === ' paragraph text' && same(a1.head, [1, 0]) && a1.depth === d0 + 1, a1);
  ok('... the rule is drawn to the end of the line, labelled', r1.a && r1.a.label === 'Page break' && r1.scan.grey > 60
    && r1.a.w > 300, r1);
  await press('Control+z');
  const a2 = await st();
  ok('Ctrl-Z: the paragraph as it was, the caret where the break went', a2.lines[0] === 'First paragraph text'
    && same(a2.head, [0, 5]) && a2.depth === d0, a2);
  await press('Control+y');
  const a3 = await st();
  ok('Ctrl-Y: the break again, the caret after it', a3.lines[0] === 'First' + O && same(a3.head, [1, 0]), a3);

  // ---------------------------------------------------- Left / Right over it
  await press('ArrowLeft');
  const m1 = await st();
  await press('ArrowLeft');
  const m2 = await st();
  await press('ArrowRight');
  const m3 = await st();
  ok('Left from the next paragraph: after the break; Left again: before it; Right: after it (one press each)',
    same(m1.head, [0, 6]) && same(m2.head, [0, 5]) && same(m3.head, [0, 6]), { m1, m2, m3 });

  // ---------------------------------------------------- Backspace / Delete
  await press('Backspace');
  const b1 = await st();
  ok('Backspace after the break removes it', b1.lines[0] === 'First' && same(b1.head, [0, 5]), b1);
  await press('Control+z');
  await caretAt(0, 5);
  await press('Delete');
  const b2 = await st();
  ok('Delete before the break removes it', b2.lines[0] === 'First' && same(b2.head, [0, 5]), b2);
  await press('Control+z');

  // ---------------------------------------------------- clicks on the rule
  const click = async (frac) => {
    const q = await ev((frac) => { const [a] = window.__rules(0); return window.__client(a.x + a.w * frac, a.y + a.h / 2); }, frac);
    await wait(DBL);
    await page.mouse.click(q.x, q.y);
    await wait(60);
    await settle();
    return (await st()).head;
  };
  const c1 = await click(0.1), c2 = await click(0.9);
  ok('a click on the rule: its left part before the break, its right part after it', same(c1, [0, 5]) && same(c2, [0, 6]), { c1, c2 });

  // ---------------------------------------------------- selection
  await caretAt(0, 5);
  await press('Shift+ArrowRight');
  const sl = await ev(() => { const [a] = window.__rules(0);
    return { s: window.__state(), head: window.__scan(a.x, a.y, 8, a.h), rest: window.__scan(a.x + 12, a.y, a.w - 12, a.h) }; });
  ok('Shift-Right selects the break: only the rule\'s first pixels are lit, the rule itself is not', same(sl.s.anchor, [0, 5])
    && same(sl.s.head, [0, 6]) && sl.head.blue > 10 && sl.rest.blue === 0 && sl.rest.grey > 60, sl);

  // ---------------------------------------------------- 200%
  const zm = await ev(async () => {
    const d = window.__doc();
    const at = () => { const [a] = window.__rules(0); return window.__scan(a.x, a.y, a.w, a.h); };
    d.win.scrollTo(0, 0);
    await window.__frames(2);
    const a = at();
    d.setZoom(200);
    d.win.scrollTo(0, 0);
    await window.__frames(3);
    return { a, b: at() };
  });
  const z1 = await click(0.1);
  // (the rule's right end is off the window at 200%: scrolled to it)
  await ev(async () => { const d = window.__doc(), [a] = window.__rules(0);
    d.win.scrollTo(Math.max(0, Math.round(window.__ws(a.x + a.w * 0.9, 0).x - d.win.w / 2)), 0); await window.__frames(3); });
  const z2 = await click(0.9);
  await ev(async () => { window.__doc().win.scrollTo(0, 0); await window.__frames(2); });
  ok('at 200% the rule is drawn larger; clicks on it still give its nearer edge', zm.b.grey > zm.a.grey * 1.8
    && same(z1, [0, 5]) && same(z2, [0, 6]), { zm, z1, z2 });
  await ev(async () => { window.__doc().setZoom(100); await window.__frames(2); });

  // ---------------------------------------------------- at an end, in an empty paragraph, over a selection
  const n0 = (await st()).lines.length;
  await caretAt(2, 6);
  await press('Control+Enter');
  const e1 = await st();
  ok('Ctrl-Enter at a paragraph\'s end: the break ends it, an empty paragraph after it', e1.lines[2] === 'Second' + O
    && e1.lines[3] === '' && e1.lines.length === n0 + 1 && same(e1.head, [3, 0]), e1);
  await press('Control+Enter');
  const e2 = await st();
  ok('... and again in that empty paragraph: a paragraph of just a break', e2.lines[3] === O && e2.lines[4] === ''
    && same(e2.head, [4, 0]), e2);
  await press('Control+z', 2);
  await caretAt(1, 3);
  await wait(DBL);
  const q = await ev(() => { const L = window.__doc().view.layout, c = L.caretRect({ id: L.items[2].id, off: 3 });
    return window.__client(c.x + 1, c.y + c.h / 2); });
  await page.keyboard.down('Shift');
  await page.mouse.click(q.x, q.y);
  await page.keyboard.up('Shift');
  await settle();
  const sd = (await st()).depth;
  await press('Control+Enter');
  const e3 = await st();
  ok('over a selection across paragraphs: it is deleted first, one undo step', e3.lines[1] === ' pa' + O
    && e3.lines[2] === 'ond' && e3.depth === sd + 1, e3.lines.slice(0, 4));
  await press('Control+z');
  const e4 = await st();
  ok('... Ctrl-Z gives it all back', e4.lines[1] === ' paragraph text' && e4.lines[2] === 'Second', e4.lines.slice(0, 4));

  // ---------------------------------------------------- copy and paste within the document
  const cp = await ev(async () => {
    const d = window.__doc(), v = d.view, L = v.layout;
    v.setSelection({ id: L.items[0].id, off: 0 }, { id: L.items[1].id, off: 0 });
    const c = d.copy();
    const last = L.items[L.items.length - 1];
    v.setSelection({ id: last.id, off: last.block.text.length });
    await d.paste({ text: c.plain, html: c.html });
    await window.__frames(3);
    const blocks = d.d.doc.sections.flatMap((s) => s.blocks);
    const b = blocks[blocks.length - 2];
    return { lines: v.lines().slice(-3), inl: b.inlines };
  });
  ok('copy and paste within the document: the break comes too, still a page break', same(cp.lines.slice(-2), ['Last oneFirst' + O, ''])
    && Object.values(cp.inl).some((x) => x.kind === 'br' && x.brType === 'page'), cp);

  // ---------------------------------------------------- section breaks
  const secAt = (k, off, id) => ev(async ([k, off, id]) => {
    const d = window.__doc(), v = d.view, L = v.layout;
    v.setSelection({ id: L.items[k].id, off });
    const depth = v.undoDepth;
    d.dw.view.run(id);
    await window.__frames(3);
    const M = v.layout, it = M.items[k];
    const band = it.marks.find((m) => m.kind === 'section');
    return { s: window.__state(), depth, secs: d.d.doc.sections.length, gap: it.gapBelow, label: band && band.label,
      next: M.items[k + 1].y - (it.y + it.h), scan: window.__scan(M.left, it.y + it.h, M.textW, 18),
      text: window.__scan(M.left, it.y, M.textW, it.h) };
  }, [k, off, id]);
  const k0 = (await st()).lines.indexOf('Second');
  const sc1 = await secAt(k0, 3, 'sectionNext');
  ok('Section break (Next page) mid-paragraph: split there, a band of 18 px under the first half, labelled; one undo step',
    sc1.secs === 2 && sc1.s.lines[k0] === 'Sec' && sc1.s.lines[k0 + 1] === 'ond' && same(sc1.s.head, [k0 + 1, 0])
    && sc1.gap === 18 && sc1.next === 18 && sc1.label === 'Section break (Next page)' && sc1.scan.grey > 80
    && sc1.s.depth === sc1.depth + 1, sc1);
  const bandClick = async (k, frac) => {
    const q = await ev(([k, frac]) => { const L = window.__doc().view.layout, it = L.items[k];
      return window.__client(L.left + L.textW * frac, it.y + it.h + 9); }, [k, frac]);
    await wait(DBL);
    await page.mouse.click(q.x, q.y);
    await wait(60);
    await settle();
    return (await st()).head;
  };
  const bc = [await bandClick(k0, 0.05), await bandClick(k0, 0.5), await bandClick(k0, 0.95)];
  ok('a click in the band: the caret at the end of the paragraph above it', bc.every((h) => same(h, [k0, 3])), bc);
  await press('Delete');
  const sd1 = await ev(() => ({ s: window.__state(), secs: window.__doc().d.doc.sections.length,
    gaps: window.__doc().view.layout.items.map((i) => i.gapBelow) }));
  ok('Delete there removes the break (the paragraphs stay apart), no band left', sd1.secs === 1
    && sd1.s.lines[k0] === 'Sec' && sd1.s.lines[k0 + 1] === 'ond' && sd1.gaps.every((g) => g === 0), sd1);
  await press('Control+z');
  const sd2 = await ev(() => ({ secs: window.__doc().d.doc.sections.length, gap: window.__doc().view.layout.items
    .map((i) => i.gapBelow) }));
  ok('Ctrl-Z puts the break back', sd2.secs === 2 && sd2.gap[k0] === 18, sd2);
  const sc2 = await secAt(0, 0, 'sectionContinuous');
  ok('Section break (Continuous) at a paragraph\'s start: an empty paragraph before it ends the section, labelled',
    sc2.secs === 3 && sc2.s.lines[0] === '' && sc2.label === 'Section break (Continuous)' && sc2.scan.grey > 80, sc2);
  await press('Control+z');

  // ---------------------------------------------------- saved
  const bytes = new Uint8Array(await ev(async () => Array.from(await window.__doc().saveBytes())));
  const xml = (await xmlEntries(bytes)).get('word/document.xml').root;
  const brs = [];
  const walk = (x, parent) => {
    if (!x || typeof x !== 'object') return;
    if (x.name === 'w:br') brs.push({ attrs: x.attrs, parent: parent?.name });
    for (const c of x.children || []) walk(c, x);
  };
  walk(xml, null);
  const back = await readDocx(bytes);
  const n = back.sections.flatMap((s) => s.blocks).flatMap((b) => Object.values(b.inlines || {}))
    .filter((x) => x.kind === 'br' && x.brType === 'page').length;
  ok('a saved copy: each page break is <w:br w:type="page"/> in a run, and reads back as one',
    brs.filter((b) => same(b.attrs, [['w:type', 'page']])).length === 3 && brs.every((b) => b.parent === 'w:r') && n === 3, { brs, n });
  const bodyEl = xml.children.find((c) => c.name === 'w:body');
  const last = bodyEl.children.at(-1);
  const inPara = bodyEl.children.filter((c) => c.name === 'w:p').map((x) => x.children.find((c) => c.name === 'w:pPr'))
    .filter((x) => x && x.children.some((c) => c.name === 'w:sectPr')).length;
  ok('... the section break: a sectPr in the break\'s paragraph, the body one with w:type nextPage; two sections read back',
    inPara === 1 && last.name === 'w:sectPr' && last.children.some((c) => c.name === 'w:type'
      && same(c.attrs, [['w:val', 'nextPage']])) && back.sections.length === 2, { inPara, last: last.name, secs: back.sections.length });
  // ---------------------------------------------------- the Insert menu
  const mn = await ev(() => {
    const d = window.__doc(), v = d.dw.view, m0 = v.mac;
    v.mac = false;
    const val = (x) => (typeof x === 'function' ? x() : x);
    const rows = (m) => m.items.map((i) => ({ text: i.text, key: i.key ?? null, shaded: !!val(i.shaded),
      sub: !!i.submenu, help: !!i.help, dotted: !!i.dotted }));
    const top = d.win.menu({}), ins = top.items.find((i) => i.text === 'Insert');
    const menu = ins.submenu(), sec = menu.items.find((i) => i.text === 'Section break').submenu();
    const out = { top: top.items.map((i) => i.text), rows: rows(menu), sec: rows(sec), title: menu.title };
    v.mac = true;
    out.mac = rows(d.win.menu({}).items.find((i) => i.text === 'Insert').submenu()).map((r) => r.key);
    v.mac = m0;
    return out;
  });
  const row = (n) => mn.rows.find((x) => x.text === n);
  ok('the window menu has Insert after Edit', same(mn.top.slice(5, 8), ['Edit', 'Insert', 'Format']), mn.top);
  ok('Insert: Page break, Section break >, Symbol..., Special character, Hyperlink..., Bookmark...',
    same(mn.rows.map((x) => x.text), ['Page break', 'Section break', 'Symbol...', 'Special character', 'Hyperlink...', 'Bookmark...'])
    && mn.rows.every((x) => x.help), mn.rows);
  ok('Page break shows Ctrl+Enter (also on a Mac: Ctrl, as Cmd-Enter stays Enter); Symbol... and Special character > are live (word-symbols.mjs); Hyperlink... is live with Ctrl+K (Cmd+K on a Mac: word-links.mjs); Bookmark... is live with Ctrl+Shift+F5 (also on a Mac)',
    row('Page break').key === 'Ctrl+Enter' && mn.mac[0] === 'Ctrl+Enter' && row('Page break').shaded === false
    && ['Symbol...', 'Special character'].every((n) => !row(n).shaded && !row(n).key)
    && !row('Hyperlink...').shaded && row('Hyperlink...').key === 'Ctrl+K' && mn.mac[4] === 'Cmd+K'
    && !row('Bookmark...').shaded && row('Bookmark...').key === 'Ctrl+Shift+F5' && mn.mac[5] === 'Ctrl+Shift+F5', mn);
  ok('Section break > Next page, Continuous: no keys, not shaded', same(mn.sec.map((x) => x.text), ['Next page', 'Continuous'])
    && mn.sec.every((x) => !x.key && !x.shaded) && row('Section break').sub, mn.sec);
  const viaMenu = await ev(async () => {
    const d = window.__doc(), v = d.view, L = v.layout;
    const find = (m, t) => m.items.find((i) => i.text === t);
    v.setSelection({ id: L.items[0].id, off: 3 });
    const n0 = v.undoDepth, secs0 = d.d.doc.sections.length;
    const ins = find(d.win.menu({}), 'Insert').submenu();
    find(ins, 'Page break').action();
    await window.__frames(3);
    const a = { depth: v.undoDepth - n0, line: v.lines()[0] };
    const M = v.layout;
    v.setSelection({ id: M.items[0].id, off: 1 });
    find(find(ins, 'Section break').submenu(), 'Continuous').action();
    await window.__frames(3);
    return { a, secs: d.d.doc.sections.length - secs0, label: v.layout.items[0].marks.find((m) => m.kind === 'section')?.label,
      depth: v.undoDepth - n0 };
  });
  ok('Insert > Page break and Section break > Continuous run the commands (one undo step each)', viaMenu.a.depth === 1
    && viaMenu.a.line.endsWith(O) && viaMenu.secs === 1 && viaMenu.label === 'Section break (Continuous)' && viaMenu.depth === 2, viaMenu);
  await press('Control+z', 2);

  // ---------------------------------------------------- page break before
  const pb = await ev(async () => {
    const d = window.__doc(), v = d.view, L0 = v.layout;
    const last = L0.items.length - 1;
    const y0 = L0.items[last].y;
    v.setSelection({ id: L0.items[last].id, off: 0 });
    const n0 = v.undoDepth;
    v.format('paraBox', { pageBreakBefore: true });
    await window.__frames(3);
    const L = v.layout, it = L.items[last];
    const m = it.marks.find((x) => x.kind === 'flow');
    return { depth: v.undoDepth - n0, shifted: it.y - y0, label: m && m.label, gap: it.gapAbove,
      scan: window.__scan(L.left, it.y - 12, L.textW, 12), text: it.block.text, last };
  });
  ok('Page break before (a paragraph flag): a 12 px gap above the paragraph with a grey dotted rule labelled "Page break before"; one undo step',
    pb.depth === 1 && pb.shifted === 12 && pb.gap === 12 && pb.label === 'Page break before' && pb.scan.grey > 80, pb);
  const pbClick = await ev(async () => {
    const d = window.__doc(), L = d.view.layout, it = L.items[L.items.length - 1];
    const q = window.__client(L.left + 40, it.y - 6);
    return q;
  });
  await wait(DBL);
  await page.mouse.click(pbClick.x, pbClick.y);
  await settle();
  const pbc = await st();
  ok('a click in the gap puts the caret at the start of the paragraph below', same(pbc.head, [pb.last, 0]), pbc);
  await press('Control+z');
  const pbu = await ev(() => window.__doc().view.layout.items.every((i) => i.gapAbove === 0));
  ok('Ctrl-Z takes the flag (and the gap) away', pbu);

  const msgs = await ev(() => window.__msgs);
  ok('no error messages', !msgs.length, msgs);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
