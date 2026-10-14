// !Letters' Outline view against the caret in hidden text (Batch D P13
// fix I1, D32: "the caret never enters them"), each route in the real
// desktop: a caret put in a collapsed heading's child in Draft comes
// out at the heading when the window goes back to Outline (and what is
// typed goes there); an undo that puts the caret back in hidden text;
// Find, Replace all and Insert > Bookmark's Go to expand the heading
// over the match (Word does);
// Enter at the end of a collapsed heading puts a heading of its level
// after the hidden block; Backspace at the start of the heading after
// one is refused (a beep, nothing merged); Tab that demotes a heading
// under a collapsed one keeps the caret drawn.
// Show first line only (P13 fix M1): Right at the end of a paragraph's
// first line goes to the next paragraph, End and a click never leave
// the caret in the hidden rest, and what is typed goes where it is drawn.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, settingsXml, p, r } from './build-docx.mjs';

const SECT = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" '
  + 'w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
const lvl = (n) => `<w:outlineLvl w:val="${n}"/>`;
const LONGP = 'word '.repeat(120).trim();
const DOC = p(r('Alpha'), lvl(0)) + p('<w:bookmarkStart w:id="0" w:name="Spot"/>' + r('a1') + '<w:bookmarkEnd w:id="0"/>') + p(r('Child'), lvl(1)) + p(r('child body'))
  + p(r('gc body hidden-needle')) + p(r('Beta'), lvl(0)) + p(r('b1')) + p(r('Gamma'), lvl(0)) + p(r(LONGP)) + p(r('g2')) + SECT;
const files = {
  OVis: await buildDocx({ 'word/document.xml': documentXml(DOC), 'word/settings.xml': settingsXml('<w:view w:val="outline"/>') }),
};
for (const k of Object.keys(files)) files[k] = Array.from(files[k]);

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const { browser, page, logs } = await launch({ height: 1000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const press = async (k) => { await page.keyboard.press(k); await ev(() => window.__frames(3)); };
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
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    window.__d = () => window.__doc('OVis');
    window.__blocks = () => window.__d().doc.sections.flatMap((s) => s.blocks);
    window.__texts = () => window.__blocks().map((b) => b.text);
    window.__at = (text, off = 0) => {
      const b = window.__blocks().find((x) => x.text === text);
      window.__d().view.setSelection({ id: b.id, off });
    };
    const st = (v, i) => (typeof v === 'function' ? v(i) : v);
    window.__pick = (top, text, sub) => {
      let m = window.__d().win.menu({}).items.find((i) => i.text === top).submenu();
      if (sub) m = m.items.find((i) => i.text === sub).submenu();
      const it = m.items.find((i) => i.text === text);
      if (st(it.shaded, it)) throw new Error(`${top} > ${text} shaded`);
      it.action(it);
    };
    /** The caret's block text and offset, whether it is drawn and has an item, what Outline shows. */
    window.__state = () => {
      const d = window.__d(), s = d.view.selection, L = d.view.layout;
      const b = window.__blocks().find((x) => x.id === s.head.id);
      return { head: b ? b.text : null, off: s.head.off, caret: !!d.view.caretRect(), item: L.byId.has(s.head.id),
        shown: L.items.map((it) => it.block.text), collapsed: d.dw.collapsed.size, text: d.view.text() };
    };
    /** Collapse (Expand) the heading with this text by the Outline menu. */
    window.__fold = async (text, cmd = 'Collapse') => {
      window.__at(text, 0);
      window.__pick('Outline', cmd);
      await window.__frames(3);
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
    await window.__word().word.open('RAM::RamDisc0.$.OVis');
    await window.__frames(3);
  }, files);

  // ------------------------------------------------ a view switch
  const v1 = await ev(async () => {
    await window.__fold('Child');
    window.__pick('View', 'Draft');
    await window.__frames(3);
    window.__at('gc body hidden-needle', 2);
    window.__pick('View', 'Outline');
    await window.__frames(3);
    return window.__state();
  });
  ok('View > Outline with the caret in a collapsed heading\'s child (put there in Draft): it moves to the heading, drawn',
    v1.head === 'Child' && v1.off === 5 && v1.caret && v1.item, v1);
  await press('X');
  const v2 = await ev(() => ({ t: window.__texts().slice(2, 5), s: window.__state() }));
  ok('... and what is typed goes there, where it is seen', same(v2.t, ['ChildX', 'child body', 'gc body hidden-needle']) && v2.s.caret, v2);
  await press('Control+z');

  // ------------------------------------------------ undo
  const u1 = await ev(async () => {
    await window.__fold('Child', 'Expand');
    window.__at('child body', 0);
    await window.__frames(2);
    return window.__state().shown.length;
  });
  await press('Q');
  await ev(() => window.__fold('Child'));
  await press('Control+z');
  const u2 = await ev(() => ({ s: window.__state(), t: window.__texts()[3] }));
  ok('Ctrl-Z that puts the caret back in hidden text: it is at the heading above, drawn',
    u1 === 10 && u2.t === 'child body' && u2.s.caret && u2.s.item && u2.s.head === 'Child', { u1, u2 });

  // ------------------------------------------------ Find and Replace all
  const f1 = await ev(async () => {
    await window.__fold('Child', 'Expand');
    await window.__fold('Alpha');
    const n = window.__state().shown.length;
    window.__d().dw.view.focus();
    const msg = window.__word().word.find.run('next', { find: 'hidden-needle' });
    await window.__frames(3);
    return { n, msg, s: window.__state() };
  });
  ok('Find of text in a collapsed heading: the heading is expanded, the match selected and shown',
    f1.n === 6 && f1.msg === '' && f1.s.text === 'hidden-needle' && f1.s.collapsed === 0 && f1.s.caret
    && f1.s.shown.includes('gc body hidden-needle'), f1);
  const f2 = await ev(async () => {
    await window.__fold('Alpha');
    window.__d().dw.view.focus();
    const msg = window.__word().word.find.run('all', { find: 'needle', replace: 'pin' });
    await window.__frames(3);
    const s = window.__state();
    window.__d().dw.view.undo();
    await window.__frames(2);
    return { msg, s };
  });
  ok('Replace all in a collapsed heading: replaced, the heading over the last one expanded, the caret drawn there',
    f2.msg === '1 replaced' && f2.s.head === 'gc body hidden-pin' && f2.s.collapsed === 0 && f2.s.caret, f2);

  // ------------------------------------------------ Go to a bookmark in a collapsed heading
  await ev(async () => { await window.__fold('Alpha'); window.__at('Beta', 0); window.__d().dw.view.focus(); });
  await press('Control+Shift+F5');
  const g0 = await ev(() => {
    const d = window.__d(), b = window.__word().word.dialog({ key: 'bookmark:' + d.docKey, rows: [] });
    b.set('name', 'Spot');
    const w = b.win, bb = w.iconByName('button:Go to').bbox, sc = w.workToScreen((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2);
    const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
    return { x: rc.left + sc.x * k, y: rc.top + sc.y * k, n: window.__state().shown.length };
  });
  await page.mouse.click(g0.x, g0.y);
  await ev(() => window.__frames(3));
  const g1 = await ev(() => window.__state());
  ok('Go to a bookmark in a collapsed heading: the heading is expanded, the bookmark\'s text selected and drawn',
    g0.n === 6 && g1.text === 'a1' && g1.collapsed === 0 && g1.caret && g1.item, { g0, g1 });
  await ev(async () => {
    const d = window.__d(), b = window.__word().word.dialog({ key: 'bookmark:' + d.docKey, rows: [] });
    b.win.close();
    d.dw.view.focus();
  });

  // ------------------------------------------------ Enter at the end of a collapsed heading
  await ev(async () => { await window.__fold('Alpha'); window.__at('Alpha', 5); window.__d().dw.view.focus(); });
  await press('Enter');
  const e1 = await ev(() => {
    const s = window.__state(), L = window.__d().view.layout;
    return { t: window.__texts().slice(0, 7), s, lvl: L.byId.get(window.__d().view.selection.head.id)?.level };
  });
  ok('Enter at the end of a collapsed heading: a new heading of its level after the hidden block, the caret in it, drawn',
    same(e1.t.slice(2), ['Child', 'child body', 'gc body hidden-needle', '', 'Beta']) && e1.s.head === '' && e1.s.caret
    && e1.lvl === 0, e1);
  await press('Control+z');

  // ------------------------------------------------ Backspace after a collapsed heading
  const b0 = await ev(() => { window.__at('Beta', 0); return { beeps: window.__beeps, t: window.__texts() }; });
  await press('Backspace');
  const b1 = await ev(() => ({ beeps: window.__beeps, t: window.__texts(), s: window.__state() }));
  ok('Backspace at the start of the heading after a collapsed one: a beep, nothing merged into the hidden text',
    b1.beeps === b0.beeps + 1 && same(b1.t, b0.t) && b1.s.head === 'Beta' && b1.s.caret, { b0: b0.beeps, b1 });

  // ------------------------------------------------ Tab (Demote) under a collapsed heading
  await press('Tab');
  const t1 = await ev(() => {
    const s = window.__state(), B = window.__blocks().find((b) => b.text === 'Beta');
    return { s, style: B.pStyle ?? null, lvl: B.pPr?.outlineLvl ?? null };
  });
  ok('Tab at the start of Beta demotes it under the collapsed Alpha (hidden now): the caret stays drawn, at Alpha',
    !t1.s.shown.includes('Beta') && t1.s.caret && t1.s.item && t1.s.head === 'Alpha', t1);
  await press('Control+z');

  // ------------------------------------------------ Show first line only (M1)
  const m0 = await ev(async (LONGP) => {
    window.__pick('Outline', 'Show first line only');
    await window.__frames(3);
    window.__at(LONGP, 0);
    const B = window.__blocks().find((b) => b.text === LONGP), it = window.__d().view.layout.byId.get(B.id);
    return { n: it.lines.length, end: it.lines[0].to, len: LONGP.length };
  }, LONGP);
  await press('End');
  const m1 = await ev(() => window.__state());
  await press('ArrowRight');
  const m2 = await ev(() => window.__state());
  await press('ArrowLeft');
  const m3 = await ev(() => window.__state());
  ok('Show first line only: End stops at the first line\'s end, Right goes on to the next paragraph, Left comes back to that end',
    m0.n === 1 && m0.end < m0.len && m1.off === m0.end && m2.head === 'g2' && m2.off === 0 && m3.head === LONGP && m3.off === m0.end
    && m3.caret, { m0, m1: m1.off, m2: [m2.head, m2.off], m3: m3.off });
  await ev((LONGP) => window.__at(LONGP, 400), LONGP);
  const m4 = await ev(() => window.__state());
  await press('Z');
  const m5 = await ev(() => window.__texts().find((t) => t.length > 100) ?? JSON.stringify(window.__texts().map((t) => t.slice(0, 20))));
  ok('... a caret put in the hidden rest goes to the end of the first line; what is typed goes there, where it is drawn',
    m4.off === m0.end && m4.caret && m5.slice(m0.end, m0.end + 1) === 'Z' && m5.length === m0.len + 1, { m4: m4.off, end: m0.end, z: m5.indexOf('Z') });
  await press('Control+z');
  await ev(async () => { window.__pick('Outline', 'Show first line only'); await window.__frames(3); });

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
