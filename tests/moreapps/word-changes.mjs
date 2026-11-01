// !Letters' tracked changes in the real desktop (Batch F2): the
// Tools menu's switch, views, Changes pane, accept and reject, and
// their keys. A document with Ann's insertion "beta" and Bob's
// deletion "delta" in paragraph 1 and Track Changes off:
// Ctrl+Shift+E (a real key) switches it on, ticked, one undo step;
// typing is then an insertion and Backspace a deletion by the user;
// Tools > Show Markup > All Markup / Final / Original ticks the view
// and lays the text out in it (deleted text takes space only in All
// Markup); Tools > Show Changes Pane opens the pane (ticked, the
// title says tracking is on, a row per change, the counts); a real
// click on a row selects the change (a deletion in Final: selected
// where it is hidden, and the pane says so); the pane's Accept and
// Tools > Reject are one undo step each; Alt+Shift+Down and Up (real
// keys) select the next and previous change, the pane's row
// following; Ctrl+Z gives a change back and the pane follows; Accept
// All gives its notice; the author filter's Reject all by this
// author; Escape and the close icon hide the pane, nothing changed;
// in the header and footer mode the items are shaded and the keys
// beep; Track Changes off by the menu, the tick back after undo;
// the pane deleted with its window.
// Needs the disc built by tools/disc-wimplib.mjs and
// disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, settingsXml, p, r } from './build-docx.mjs';

const D = '2024-01-02T03:04:00Z';
const att = (id, au) => `w:id="${id}" w:author="${au}" w:date="${D}"`;
const ins = (id, t, au) => `<w:ins ${att(id, au)}>${r(t)}</w:ins>`;
const del = (id, t, au) => `<w:del ${att(id, au)}><w:r><w:delText xml:space="preserve">${t}</w:delText></w:r></w:del>`;
const LINE = (k) => p(r(`Paragraph ${k} has enough words in it to fill most of a line of the page, and then some more.`));
let body = p(r('Alpha ') + ins(1, 'beta', 'Ann') + r(' gamma ') + del(2, 'delta', 'Bob') + r(' epsilon.'));
for (let k = 1; k < 30; k++) body += LINE(k);
const bytes = await buildDocx({ 'word/document.xml': documentXml(body),
  'word/settings.xml': settingsXml('<w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/>') });
const files = { Tc: Array.from(bytes) };

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);

const { browser, page, logs } = await launch({ height: 1000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
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
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = (...a) => { window.__beeps++; return beep(...a); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = () => window.__word()?.word.docs.find((d) => d.leaf === 'Tc');
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
    await window.__word().word.open('RAM::RamDisc0.$.Tc');
    await window.__frames(3);
    window.__doc().win.open({ x: 40, y: 40, w: 900, h: 800, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    window.__menu = (...names) => {
      let items = window.__doc().win.menu({}).items, it = null;
      for (const n of names) {
        it = items.find((i) => i.text === n);
        if (!it) return null;
        if (it.submenu) items = it.submenu().items;
      }
      return it;
    };
    window.__val = (f, it) => (typeof f === 'function' ? f(it) : !!f);
    window.__pane = () => window.__doc().dw.boxes.get('changes')?.api ?? null;
    /** Paragraph k as text with its tagged stretches in brackets: [ins1Ann:beta]. */
    window.__shown = (k) => {
      const b = window.__doc().dw.doc.sections[0].blocks[k];
      let s = '';
      for (const x of b.runs) {
        const t = b.text.slice(x.start, x.end).replaceAll('￼', '');
        if (t) s += x.rev ? `[${x.rev.kind}${x.rev.author}:${t}]` : t;
      }
      return s;
    };
    window.__state = () => {
      const d = window.__doc(), a = window.__pane(), v = d.dw.view, s = v.sel;
      const b0 = d.dw.doc.sections[0].blocks[0];
      return { depth: d.d.undoDepth, p0: window.__shown(0), markup: d.dw.markup, L: v.L.markup,
        open: !!a?.isOpen, rows: a ? a.rows.map((x) => [x.label, x.author, x.text, x.editable]) : null,
        chosen: a?.selected ?? null, msg: a?.message ?? '', title: a?.title ?? null, sum: a?.summary ?? null,
        sel: s && s.anchor.id === b0.id && s.head.id === b0.id ? [s.anchor.off, s.head.off] : null,
        beeps: window.__beeps, caretInDoc: os.wimp.caret?.window === d.dw.win, hdr: !!v.hdr,
        msgs: window.__msgs.slice() };
    };
  }, files);

  const settle = () => ev(() => window.__frames(4));
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  const press = async (k) => { await page.keyboard.press(k); await settle(); };
  const st = () => ev(() => window.__state());
  const menuItem = (...names) => ev((names) => {
    const it = window.__menu(...names);
    return it ? { shaded: window.__val(it.shaded, it), ticked: window.__val(it.ticked, it), key: it.key ?? '',
      help: typeof it.help === 'function' ? it.help() : it.help } : null;
  }, names);
  const runMenu = (...names) => ev(async (names) => {
    const it = window.__menu(...names);
    if (!it || window.__val(it.shaded, it)) return false;
    it.action(it);
    await window.__frames(4);
    return true;
  }, names);
  const caretAt = (k, a, z = a) => ev(async ([k, a, z]) => {
    const d = window.__doc(), v = d.dw.view, b = d.dw.doc.sections[0].blocks[k];
    v.setSelection({ anchor: { id: b.id, off: a }, head: { id: b.id, off: z }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  }, [k, a, z]);
  /** A real click at work point (x, y) of the pane, or on its icon n. */
  const clickPane = async (what) => {
    const c = await ev((what) => {
      const w = window.__pane().win;
      let x, y;
      if (typeof what === 'string') {
        const bb = w.iconByName(what).bbox;
        x = (bb.x0 + bb.x1) / 2; y = (bb.y0 + bb.y1) / 2;
      } else ({ x, y } = what);
      const s = w.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    }, what);
    await page.mouse.click(c.x, c.y);
    await settle();
  };
  const clickRow = async (i) => {
    const w = await ev((i) => { const a = window.__pane(); return a.where(a.rows[i].key); }, i);
    await clickPane({ x: w.x + 40, y: w.y + w.h / 2 });
  };
  /** The width of paragraph 0's first line (deleted text takes space in All Markup only). */
  const width0 = () => ev(() => {
    const L = window.__doc().dw.view.L, b = window.__doc().dw.doc.sections[0].blocks[0];
    const it = L.byId.get(b.id);
    return Math.round(it.lines[0].items.reduce((s, x) => s + x.w, 0));
  });

  // ------------------------------------------- the switch, by its key
  const t0 = await menuItem('Tools', 'Track Changes');
  const s0 = await st();
  await caretAt(0, 0);
  await press('Control+Shift+E');
  const t1 = await menuItem('Tools', 'Track Changes'), s1 = await st();
  ok('Ctrl+Shift+E: Track Changes on, ticked, one undo step; the menu shows the key', t0 && !t0.ticked && !t0.shaded
    && /Shift\+E$/.test(t0.key) && t1.ticked && s1.depth === s0.depth + 1, { t0, t1, s0: s0.depth, s1: s1.depth });

  // typing and deleting are recorded
  await caretAt(0, 'Alpha beta gamma delta epsilon.'.length);
  await page.keyboard.type('XY');
  await settle();
  const s2 = await st();
  ok('typing with Track Changes on: an insertion by the user', /\[insAuthor:XY\]$|\[ins[^:]+:XY\]$/.test(s2.p0), s2.p0);
  await caretAt(0, 1);
  await press('Backspace');
  const s3 = await st();
  ok('Backspace: a tracked deletion, the text kept', /^\[del[^:]+:A\]lpha /.test(s3.p0) && s3.depth === s2.depth + 1,
    { p0: s3.p0, d: [s2.depth, s3.depth] });

  // ------------------------------------------------------ the views
  const wFinal = await width0();
  await runMenu('Tools', 'Show Markup', 'All Markup');
  const v1 = await st(), m1 = await menuItem('Tools', 'Show Markup', 'All Markup'), wAll = await width0();
  await runMenu('Tools', 'Show Markup', 'Original');
  const v2 = await st(), m2 = await menuItem('Tools', 'Show Markup', 'Original');
  const mf = await menuItem('Tools', 'Show Markup', 'Final');
  await runMenu('Tools', 'Show Markup', 'Final');
  const v3 = await st(), wBack = await width0();
  ok('Show Markup: All Markup, Original, Final each laid out and ticked; deleted text takes space only in All Markup',
    v1.markup === 'all' && v1.L === 'all' && m1.ticked && v2.markup === 'original' && v2.L === 'original'
      && m2.ticked && !mf.ticked && v3.L === 'final' && wAll > wFinal && wBack === wFinal
      && v3.depth === s3.depth, { v1: v1.L, v2: v2.L, v3: v3.L, wFinal, wAll, wBack });

  // -------------------------------------------------------- the pane
  const pm0 = await menuItem('Tools', 'Show Changes Pane');
  await runMenu('Tools', 'Show Changes Pane');
  const p1 = await st(), pm1 = await menuItem('Tools', 'Show Changes Pane');
  ok('Tools > Show Changes Pane: open, ticked, a row per change in order, the counts, tracking said in the title',
    !pm0.ticked && pm1.ticked && p1.open && JSON.stringify(p1.rows.map((x) => [x[0], x[2]]))
      === '[["Deleted","A"],["Inserted","beta"],["Deleted","delta"],["Inserted","XY"]]'
      && p1.sum === '4 changes: 2 inserted, 2 deleted, 0 moved' && /tracking on/.test(p1.title), p1);
  await clickRow(2);
  const p2 = await st();
  ok('a real click on Bob\'s deletion in Final: selected where it is hidden, the pane says so', p2.chosen !== null
    && JSON.stringify(p2.sel) === '[17,22]' && /Hidden in Final/.test(p2.msg) && p2.depth === p1.depth, p2);
  await clickRow(1);
  const p3 = await st();
  ok('a click on Ann\'s insertion selects it', JSON.stringify(p3.sel) === '[6,10]', p3);
  await clickPane('button:Accept');
  const p4 = await st();
  ok('the pane\'s Accept: the insertion kept untagged, one undo step, its row gone', p4.depth === p3.depth + 1
    && /lpha beta gamma /.test(p4.p0) && !p4.p0.includes('[insAnn') && p4.rows.length === 3, p4);

  // Tools > Reject at the caret in a change (Bob's deletion), in All Markup
  await runMenu('Tools', 'Show Markup', 'All Markup');
  await caretAt(0, 19);
  const rj = await menuItem('Tools', 'Reject');
  await runMenu('Tools', 'Reject');
  const p5 = await st();
  ok('Tools > Reject at the caret: Bob\'s deletion undone (text kept, no mark), one step, the pane follows', rj
    && !rj.shaded && p5.depth === p4.depth + 1 && p5.p0.includes(' gamma delta epsilon.') && p5.rows.length === 2, p5);

  // ------------------------------------------ Next / Previous by keys
  await caretAt(0, 0);
  await press('Alt+Shift+ArrowDown');
  const n1 = await st();
  await press('Alt+Shift+ArrowDown');
  const n2 = await st();
  await press('Alt+Shift+ArrowUp');
  const n3 = await st();
  const nm = await menuItem('Tools', 'Next Change');
  ok('Alt+Shift+Down and Up: the next and previous change selected, the pane\'s row chosen; the menu shows the keys',
    JSON.stringify(n1.sel) === '[0,1]' && n1.chosen !== null && n2.sel && n2.sel[1] - n2.sel[0] === 2
      && JSON.stringify(n3.sel) === '[0,1]' && n3.chosen === n1.chosen && /Shift\+Down$/.test(nm.key), { n1, n2, n3 });
  await clickPane('button:Next');
  const n4 = await st(), b4 = n4.beeps;
  await clickPane('button:Next');
  const n5 = await st();
  ok('the pane\'s Next: to the last change, then a beep and a message at the end, nothing changed',
    n4.sel && n4.sel[1] - n4.sel[0] === 2 && n5.beeps === b4 + 1 && /no tracked change after/.test(n5.msg)
      && n5.depth === n4.depth, { n4, n5 });

  // ------------------------------------------------------------ undo
  await ev(() => window.__doc().dw.view.focus());
  await press(`${mod}+z`);
  const u1 = await st();
  ok('Ctrl+Z: Bob\'s deletion back, the pane lists it again', u1.depth === n5.depth - 1 && u1.rows.length === 3
    && u1.p0.includes('[delBob:delta]'), u1);

  // ------------------------------------------ the author filter's buttons
  await ev(() => window.__pane().setFilter('Bob'));
  const f1 = await st();
  await clickPane('button:Reject all by this author');
  const f2 = await st();
  ok('Show Bob, Reject all by this author: Bob\'s change rejected, one step, the pane says how many', f1.rows.length === 1
    && f2.depth === f1.depth + 1 && f2.p0.includes(' gamma delta epsilon.') && !f2.p0.includes('Bob')
    && /^1 change rejected/.test(f2.msg), { f1, f2 });
  await ev(() => window.__pane().setFilter(null));
  const sh = await ev(() => window.__pane().win.iconByName('button:Accept all by this author').shaded);
  ok('All authors: the by-author buttons shaded', sh === true, sh);

  // ---------------------------------------------------- Accept All
  await ev(() => { window.__msgs.length = 0; });
  await runMenu('Tools', 'Accept All');
  const a1 = await st(), aa = await menuItem('Tools', 'Accept All');
  ok('Tools > Accept All: one step, every change resolved, the notice says how many; then shaded', a1.depth === f2.depth + 1
    && !/\[/.test(a1.p0) && a1.msgs.length === 1 && /^2 changes accepted\.$/.test(a1.msgs[0]) && aa.shaded
    && a1.rows.length === 0, a1);
  const empty = await ev(() => window.__pane().summary);
  ok('the empty pane: no counts, its list says so', empty === '', empty);
  await ev(() => window.__doc().dw.view.focus());
  await press(`${mod}+z`);
  const a2 = await st();
  ok('Ctrl+Z: both changes back in the pane', a2.rows.length === 2 && a2.depth === a1.depth - 1, a2);

  // --------------------------------------- Escape and close: nothing changed
  await ev(() => os.wimp.setCaret(window.__pane().win));
  const e0 = await st();
  await press('Escape');
  const e1 = await st();
  ok('Escape hides the pane, the caret back in the document, nothing changed', e0.open && !e1.open && e1.caretInDoc
    && e1.depth === e0.depth && e1.p0 === e0.p0, e1);
  await runMenu('Tools', 'Show Changes Pane');
  await ev(() => { window.__pane().win.emit('close', { preventDefault() {} }); });
  await settle();
  const e2 = await st();
  ok('the close icon hides it too, nothing changed', !e2.open && e2.depth === e0.depth, e2);

  // ------------------------------------------ the header and footer mode
  await caretAt(1, 0);
  await runMenu('View', 'Header and footer');
  const h0 = await st();
  const shaded = [];
  for (const t of ['Track Changes', 'Accept', 'Reject', 'Accept All', 'Reject All', 'Previous Change', 'Next Change']) {
    const it = await menuItem('Tools', t);
    shaded.push(it && it.shaded && /Leave the header/.test(it.help));
  }
  const live = await menuItem('Tools', 'Show Markup');
  await press('Control+Shift+E');
  await press('Alt+Shift+ArrowDown');
  const h1 = await st();
  ok('in the header and footer mode the change items are shaded (why in their help); Ctrl+Shift+E and Alt+Shift+Down beep, '
    + 'nothing changed', h0.hdr && shaded.every(Boolean) && !live.shaded && h1.beeps === h0.beeps + 2
    && h1.depth === h0.depth, { shaded, h0: h0.beeps, h1: h1.beeps });
  await ev(() => window.__doc().dw.view.focus());
  await press('Escape');
  await ev(() => { window.__msgs.length = 0; });

  // ------------------------------------- the switch off by the menu; undo
  await runMenu('Tools', 'Track Changes');
  const o1 = await menuItem('Tools', 'Track Changes'), od = await st();
  await ev(() => window.__doc().dw.view.focus());
  await press(`${mod}+z`);
  const o2 = await menuItem('Tools', 'Track Changes'), od2 = await st();
  ok('Tools > Track Changes off: unticked; Ctrl+Z: ticked again', !o1.ticked && o2.ticked && od2.depth === od.depth - 1,
    { o1, o2 });

  const msgs = await ev(() => window.__msgs);
  ok('nothing else reported', !msgs.length, msgs);

  // the pane goes with its window
  await runMenu('Tools', 'Show Changes Pane');
  const gone = await ev(async () => {
    const d = window.__doc(), a = window.__pane(), open = a.isOpen;
    d.dw.close();
    await window.__frames(3);
    return { open, gone: a.gone, deleted: !os.wimp.windows?.includes?.(a.win) };
  });
  ok('closing the document deletes its pane', gone.open && gone.gone, gone);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
