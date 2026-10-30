// !Letters' comments in the real desktop (Batch F1). Two documents
// with the same text: Cm with three comments (Ann's over "beta
// gamma", a point comment of Ann's (a reference only) in paragraph
// 3, Bob's resolved one over "resolved words"), Plain with none. In
// Draft, Print layout, Outline and Web: Ann's range is lit in her
// soft colour (the pixel at the top of its box, multiplied into the
// white page), the point comment's marker in her strong one, Bob's
// in his light one; Plain is white there; every paragraph's lines
// at the same places as Plain's, and in Print layout the same pages
// with the same starts. dw.setComment(1) (what the Comments pane
// will do) draws Ann's range in her strong colour; dw.setComment(null)
// back to soft; no undo step either way.
// The Comments pane (Task 6): Tools > Show Comments opens it (ticked)
// with the three comments, Bob's resolved; Unresolved leaves it out;
// choosing a row selects its range in the document, in each view.
// Insert > Comment... with no name asks for it first (the User name
// and initials box), then the pane's field: two lines typed,
// Ctrl+Return posts one comment (one undo step). Reply, Resolve
// (Reopen after), Edit, Delete (one step each); Ctrl+Z gives the
// deleted one back and the pane follows; the field's Cancel changes
// nothing; Escape hides the pane, the caret back in the document;
// Ctrl+Alt+M opens it for a new comment. In the header and footer
// mode Insert > Comment... is shaded, Ctrl+Alt+M beeps and the
// pane's Reply beeps and says why. Tools > Delete comments in
// selection is shaded with a caret. Needs the disc built by
// tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { commentParts, cr, range } from './comment-fixtures.mjs';

const LINE = (k) => p(r(`Paragraph ${k} has enough words in it to fill most of a line of the page, and then some more.`));
let body = p(r('Alpha ') + range(1, r('beta gamma')) + r(' delta')), plain = p(r('Alpha beta gamma delta'));
body += LINE(1);
plain += LINE(1);
body += p(r('Here is') + cr(2) + r(' a point comment.'));
plain += p(r('Here is a point comment.'));
body += p(r('Some ') + range(3, r('resolved words')) + r(' here.'));
plain += p(r('Some resolved words here.'));
for (let k = 4; k < 70; k++) {
  // (paragraph 10 holds Dee's comment 4, in bold: a lossy edit)
  body += k === 10 ? p(range(4, r('Paragraph 10 has words.'))) : LINE(k);
  plain += k === 10 ? p(r('Paragraph 10 has words.')) : LINE(k);
}
const c = commentParts({ 1: { text: 'Look', author: 'Ann' }, 2: { text: 'Point', author: 'Ann' },
  3: { text: 'Done', author: 'Bob', done: true }, 4: { text: 'Bold one', author: 'Dee' } });
c.parts['word/comments.xml'] = c.parts['word/comments.xml'].replace('<w:r><w:t xml:space="preserve">Bold one',
  '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Bold one');
const cmBytes = await buildDocx({ 'word/document.xml': documentXml(body), ...c.parts }, { docRels: c.docRels });
const plainBytes = await buildDocx({ 'word/document.xml': documentXml(plain) });
const files = { Cm: Array.from(cmBytes), Plain: Array.from(plainBytes) };

// (the palette of ./CommentPaint, by FNV-1a of the author's name)
const PALETTE = [['#fbe7a1', '#fdf4d4', '#f2cc45'], ['#cbe8c1', '#e7f4e2', '#8ccb7b'], ['#f6cbd7', '#fbe7ed', '#e98ba7'],
  ['#c8dcf4', '#e5eefa', '#83afe6'], ['#e0cff1', '#f0e7f8', '#b693de'], ['#f8d4b3', '#fcebdc', '#ef9f5f']];
const colourOf = (s) => {
  let h = 0x811c9dc5;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 0x01000193) >>> 0;
  return PALETTE[h % 6];
};
const rgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
const near = (a, h) => !!a && rgb(h).every((v, k) => Math.abs(v - a[k]) <= 4);
const WHITE = '#ffffff';
const ANN = colourOf('Ann'), BOB = colourOf('Bob');

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
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => d.leaf === leaf);
    /** The canvas pixel [r, g, b] at layout point (x, y) of leaf's window, scrolled into view first. */
    window.__px = async (leaf, x, y) => {
      const d = window.__doc(leaf), w = d.win, v = d.dw.view, z = v.zoom, t = v.L.top;
      const wx = x * z, wy = t + (y - t) * z;
      if (wy < w.scrollY + 20 || wy > w.scrollY + w.h - 20) {
        w.scrollTo(w.scrollX, Math.max(0, Math.round(wy - w.h / 2)));
        await window.__frames(3);
      }
      const cv = w._canvas, k = cv.width / w.w;
      const a = cv.getContext('2d').getImageData(Math.floor((wx - w.scrollX) * k), Math.floor((wy - w.scrollY) * k), 1, 1).data;
      return [a[0], a[1], a[2]];
    };
    /** Where leaf's comments are lit: the boxes of the range k (paragraph, start mark, end mark) or a point (para, ref). */
    window.__boxes = (leaf) => {
      const d = window.__doc(leaf), L = d.dw.view.L, bs = d.dw.doc.sections[0].blocks;
      const offOf = (b, kind, id) => Number(Object.keys(b.inlines || {}).find((k) => b.inlines[k].kind === kind
        && b.inlines[k].id === id));
      const rangeOf = (i, id) => {
        const b = bs[i];
        return L.selectionRects({ anchor: { id: b.id, off: offOf(b, 'cmtStart', id) }, head: { id: b.id, off: offOf(b, 'cmtEnd', id) } });
      };
      const b2 = bs[2], c2 = L.caretRect({ id: b2.id, off: offOf(b2, 'cmtRef', 2) }, 'down');
      return { one: rangeOf(0, 1)[0], three: rangeOf(3, 3)[0], point: { x: c2.x, y: c2.y } };
    };
    /** Leaf's lines: each item's y and its lines' y, h and text span; Print layout: the pages' starts. */
    window.__shape = (leaf) => {
      const d = window.__doc(leaf), L = d.dw.view.L, P = L.place.pages;
      const items = L.items.map((it) => [it.y, it.h, (it.lines || []).map((l) => [l.y, l.h, Math.round(l.items.reduce((s, x) => s + x.w, 0))])]);
      if (P) P.finish();
      const pages = P ? P.list.map((pg) => [pg.start.k, pg.start.line, pg.start.dy || 0, pg.top]) : null;
      const shown = d.dw.doc.sections[0].blocks.map((b) => (L.byId.get(b.id) ? L.place.rects(L.byId.get(b.id), 0, 1)[0].y : null));
      return { items, pages, shown };
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
    for (const leaf of ['Cm', 'Plain']) {
      await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      await window.__frames(3);
      window.__doc(leaf).win.open({ x: 40, y: 40, w: 1000, h: 800, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(3);
    }
  }, files);

  const settle = () => ev(() => window.__frames(4));
  const setView = async (view) => {
    await ev(async (view) => {
      for (const leaf of ['Cm', 'Plain']) {
        const d = window.__doc(leaf);
        if (d.viewName !== view) d.setView(view);
      }
      await window.__frames(4);
    }, view);
    await settle();
  };
  const px = (leaf, x, y) => ev(([l, x, y]) => window.__px(l, x, y), [leaf, x, y]);
  const front = (leaf) => ev(async (leaf) => {
    window.__doc(leaf).win.bringToFront();
    window.__doc(leaf).win.invalidate();
    await window.__frames(3);
  }, leaf);

  for (const view of ['draft', 'print', 'outline', 'web']) {
    await setView(view);
    const got = await ev(() => window.__doc('Cm').viewName);
    ok(`${view}: shown`, got === view, got);
    const sa = await ev(() => window.__shape('Cm')), sb = await ev(() => window.__shape('Plain'));
    ok(`${view}: every line where the copy with no comments has it`, JSON.stringify(sa.items) === JSON.stringify(sb.items)
      && JSON.stringify(sa.shown) === JSON.stringify(sb.shown), { a: sa.items.slice(0, 4), b: sb.items.slice(0, 4) });
    if (view === 'print') {
      ok('print: the same pages, the same page starts', sa.pages && sa.pages.length > 1
        && JSON.stringify(sa.pages) === JSON.stringify(sb.pages), { a: sa.pages, b: sb.pages });
    }
    const bx = await ev(() => window.__boxes('Cm'));
    await front('Cm');
    const a1 = await px('Cm', bx.one.x + 2, bx.one.y + 1);
    const a3 = await px('Cm', bx.three.x + 2, bx.three.y + 1);
    const a2 = await px('Cm', bx.point.x, bx.point.y + 2);
    ok(`${view}: Ann's range in her soft colour`, near(a1, ANN[0]), { a1, want: ANN[0], bx });
    ok(`${view}: Bob's resolved range in his light colour`, near(a3, BOB[1]), { a3, want: BOB[1] });
    ok(`${view}: the point comment's marker in Ann's strong colour`, near(a2, ANN[2]), { a2, want: ANN[2] });
    await front('Plain');
    const b1 = await px('Plain', bx.one.x + 2, bx.one.y + 1);
    ok(`${view}: the copy with no comments is white there`, near(b1, WHITE), b1);
  }

  // the selected comment (the Comments pane sets it in Task 6)
  await setView('print');
  await front('Cm');
  const bx = await ev(() => window.__boxes('Cm'));
  const sel = await ev(async () => {
    const d = window.__doc('Cm'), depth = d.d.undoDepth, dirty = d.d.dirty;
    const set = d.dw.setComment(1), again = d.dw.setComment(1);
    await window.__frames(3);
    return { set, again, comment: d.dw.comment, depth: d.d.undoDepth === depth, dirty: d.d.dirty === dirty };
  });
  const s1 = await px('Cm', bx.one.x + 2, bx.one.y + 1);
  ok('dw.setComment(1): Ann\'s range in her strong colour, no undo step', sel.set === true && sel.again === false
    && sel.comment === 1 && sel.depth && sel.dirty && near(s1, ANN[2]), { sel, s1, want: ANN[2] });
  const back = await ev(async () => {
    const d = window.__doc('Cm'), r = d.dw.setComment(null);
    await window.__frames(3);
    return { r, comment: d.dw.comment };
  });
  const s2 = await px('Cm', bx.one.x + 2, bx.one.y + 1);
  ok('dw.setComment(null): soft again', back.r === true && back.comment === null && near(s2, ANN[0]), { back, s2 });

  // ------------------------------------------------ the Comments pane (Task 6)
  await setView('print');
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  const press = async (k) => { await page.keyboard.press(k); await settle(); };
  await ev(() => {
    window.__menu = (d, ...names) => {
      let items = d.win.menu({}).items, it = null;
      for (const n of names) {
        it = items.find((i) => i.text === n);
        if (!it) return null;
        if (it.submenu) items = it.submenu().items;
      }
      return it;
    };
    window.__val = (f) => (typeof f === 'function' ? f() : !!f);
    window.__pane = () => window.__doc('Cm').dw.boxes.get('comments')?.api ?? null;
    window.__state = () => {
      const d = window.__doc('Cm'), a = window.__pane(), m = d.dw.doc.comments.map;
      return { depth: d.d.undoDepth, open: !!a?.isOpen, mode: a?.mode ?? null, rows: a ? a.rows.map((x) => [x.id, x.depth, x.resolved]) : null,
        msg: a?.message ?? '', comment: d.dw.comment, beeps: window.__beeps, sel: d.dw.view.text(),
        resolveText: a?.win.iconByName('button:Resolve').text,
        cm: [...m.values()].map((c) => [c.id, c.author, c.blocks.filter((b) => b.type === 'p').map((b) => b.text.replace(/\ufffc/g, '')).join('\n'), c.parent, c.done]),
        caretInDoc: os.wimp.caret?.window === d.dw.win, hdr: !!d.dw.view.hdr };
    };
  });
  const st = () => ev(() => window.__state());
  const menuItem = (...names) => ev((names) => {
    const it = window.__menu(window.__doc('Cm'), ...names);
    return it ? { shaded: window.__val(it.shaded), ticked: window.__val(it.ticked) } : null;
  }, names);
  const runMenu = (...names) => ev(async (names) => {
    const it = window.__menu(window.__doc('Cm'), ...names);
    if (!it || window.__val(it.shaded)) return false;
    it.action(it);
    await window.__frames(4);
    return true;
  }, names);
  /** A click on a window's icon by name, with the mouse. */
  const clickIcon = async (which, name) => {
    const c = await ev(([which, n]) => {
      const d = window.__doc('Cm');
      const w = which === 'pane' ? window.__pane().win : d.dw.boxes.get(which);
      const bb = w.iconByName(n).bbox, s = w.workToScreen((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2);
      const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    }, [which, name]);
    await page.mouse.click(c.x, c.y);
    await settle();
  };
  const caretIn = (k, a, z = a) => ev(async ([k, a, z]) => {
    const d = window.__doc('Cm'), v = d.dw.view, b = d.dw.doc.sections[0].blocks[k];
    v.setSelection({ anchor: { id: b.id, off: a }, head: { id: b.id, off: z }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  }, [k, a, z]);
  const pane = (fn, arg) => ev(async ([fn, arg]) => {
    const a = window.__pane();
    const r = a[fn](arg);
    await window.__frames(4);
    return r ?? null;
  }, [fn, arg]);

  const t0 = await menuItem('Tools', 'Show Comments');
  await runMenu('Tools', 'Show Comments');
  const p1 = await st(), t1 = await menuItem('Tools', 'Show Comments');
  ok('Tools > Show Comments: the pane, its three comments (Bob\'s resolved), the item ticked', t0 && !t0.ticked && t1.ticked
    && p1.open && JSON.stringify(p1.rows) === '[[1,0,false],[2,0,false],[3,0,true],[4,0,false]]', { t0, t1, p1 });
  await pane('setFilter', 'unresolved');
  const p2 = await st();
  ok('Unresolved: Bob\'s resolved comment left out', JSON.stringify(p2.rows) === '[[1,0,false],[2,0,false],[4,0,false]]', p2);
  await pane('setFilter', 'all');
  for (const view of ['draft', 'outline', 'web', 'print']) {
    await setView(view);
    await caretIn(1, 0);
    const r = await pane('select', 1);
    const p = await st();
    ok(`${view}: choosing a row selects its range in the document`, r === true && p.sel === 'beta gamma'
      && p.comment === 1 && p.open, p);
  }
  const tm = await menuItem('Tools', 'Delete comments in selection');
  await caretIn(1, 3);
  const tm2 = await menuItem('Tools', 'Delete comments in selection');
  ok('Tools > Delete comments in selection: live on a selection, shaded with a caret', tm && !tm.shaded && tm2.shaded,
    { tm, tm2 });

  // Insert > Comment... with no name: the User name and initials box first
  await caretIn(1, 0, 9);
  const ic = await menuItem('Insert', 'Comment...');
  const a0 = await st();
  await runMenu('Insert', 'Comment...');
  const author = await ev(() => {
    const w = window.__doc('Cm').dw.boxes.get('author');
    return w && w.isOpen ? w.iconByName('msg')?.text ?? 'open' : null;
  });
  ok('Insert > Comment... (live) with no name: the User name and initials box asks first', ic && !ic.shaded
    && author !== null, { ic, author });
  await ev(() => {
    const d = window.__doc('Cm'), b = window.__word().word.dialog({ key: 'author:' + d.dw.docKey, rows: [] });
    b.set('name', 'Cy Test');
    b.set('initials', 'CT');
  });
  await clickIcon('author', 'button:OK');
  await settle();
  const a1 = await st();
  ok('OK: the pane for a new comment, nothing written yet', a1.open && a1.mode === 'add' && a1.depth === a0.depth, a1);
  await page.keyboard.type('First line');
  await press('Enter');
  await page.keyboard.type('Second');
  await press('Control+Enter');
  const a2 = await st();
  const made = a2.cm.find((c) => c[1] === 'Cy Test');
  ok('typed two lines, Ctrl+Return: one comment by Cy Test with both paragraphs, one undo step, listed',
    made && made[2] === 'First line\nSecond' && a2.depth === a0.depth + 1 && a2.mode === null
      && a2.rows.length === 5, a2);

  // Reply, Edit, Resolve, Delete, undo
  await pane('select', 1);
  await clickIcon('pane', 'button:Reply');
  const r0 = await st();
  ok('Reply: the field for the answer', r0.mode === 'reply', r0);
  await page.keyboard.type('Agreed');
  await clickIcon('pane', 'button:Post');
  const r1 = await st();
  const rep = r1.cm.find((c) => c[2] === 'Agreed');
  ok('Post: a reply to Ann\'s comment, indented under it, one step', rep && rep[3] === 1 && rep[1] === 'Cy Test'
    && r1.depth === r0.depth + 1 && r1.rows.some((x) => x[0] === rep[0] && x[1] === 1), r1);
  await pane('select', 1);
  await clickIcon('pane', 'button:Edit');
  const e0 = await st();
  await ev(() => window.__pane().setText('Look closer'));
  await clickIcon('pane', 'button:Post');
  const e1 = await st();
  ok('Edit: the field holds the text; Post changes it, one step', e0.mode === 'edit'
    && e1.cm.find((c) => c[0] === 1)[2] === 'Look closer' && e1.depth === e0.depth + 1, { e0, e1 });
  await pane('select', 1);
  await clickIcon('pane', 'button:Resolve');
  const rs1 = await st();
  ok('Resolve: Ann\'s comment and its reply resolved, one step; the button reads Reopen', rs1.cm.find((c) => c[0] === 1)[4]
    && rs1.cm.find((c) => c[0] === rep[0])[4] && rs1.depth === e1.depth + 1 && rs1.resolveText === 'Reopen', rs1);
  await pane('select', 2);
  await clickIcon('pane', 'button:Delete');
  const d1 = await st();
  ok('Delete: the point comment gone, one step, not chosen any more', !d1.cm.some((c) => c[0] === 2)
    && d1.depth === rs1.depth + 1 && d1.comment === null && !d1.rows.some((x) => x[0] === 2), d1);
  await ev(() => window.__doc('Cm').dw.view.focus());
  await press(`${mod}+z`);
  const u1 = await st();
  ok('Ctrl+Z: the point comment back, the pane lists it again', u1.cm.some((c) => c[0] === 2)
    && u1.rows.some((x) => x[0] === 2) && u1.depth === d1.depth - 1, u1);

  // a lossy edit: the choice; Cancel keeps the field; Edit writes
  await pane('select', 4);
  await clickIcon('pane', 'button:Edit');
  await ev(() => window.__pane().setText('Plain now'));
  const l0 = await st();
  await clickIcon('pane', 'button:Post');
  const lossOpen = () => ev(() => !!window.__doc('Cm').dw.boxes.get('cmtlossy')?.isOpen);
  const l1 = await st(), lb1 = await lossOpen();
  ok('Edit of a bold comment, Post: the choice asks first, nothing written', lb1 && l1.depth === l0.depth
    && l1.cm.find((c) => c[0] === 4)[2] === 'Bold one', { lb1, l1 });
  await clickIcon('cmtlossy', 'button:Cancel');
  const l2 = await st(), lb2 = await lossOpen();
  ok('its Cancel: the choice gone, the field still on the edit with the text, nothing written', !lb2 && l2.mode === 'edit'
    && (await ev(() => window.__pane().text)) === 'Plain now' && l2.depth === l0.depth, l2);
  await clickIcon('pane', 'button:Post');
  await clickIcon('cmtlossy', 'button:Edit');
  const l3 = await st();
  ok('Post again and Edit: the plain text written, one step, the field left', !(await lossOpen())
    && l3.cm.find((c) => c[0] === 4)[2] === 'Plain now' && l3.depth === l0.depth + 1 && l3.mode === null, l3);

  // the document changed while a reply was typed: Post refills and says so; again: made
  await pane('select', 1);
  await clickIcon('pane', 'button:Reply');
  await page.keyboard.type('Later');
  await caretIn(5, 0);
  await page.keyboard.type('x');
  await settle();
  const g0 = await st();
  await pane('press', 'Post');
  const g1 = await st();
  ok('Post after the document changed: a beep, said so, the text kept, nothing written', g1.beeps === g0.beeps + 1
    && /changed while you typed/.test(g1.msg) && g1.mode === 'reply' && (await ev(() => window.__pane().text)) === 'Later'
    && g1.depth === g0.depth, g1);
  await pane('press', 'Post');
  const g2 = await st();
  ok('Post again: the reply made, one step', g2.cm.some((c) => c[2] === 'Later' && c[3] === 1) && g2.depth === g1.depth + 1
    && g2.mode === null, g2);

  // the draft survives hiding the pane; another target is refused while it is there
  await pane('select', 1);
  await clickIcon('pane', 'button:Reply');
  await page.keyboard.type('Draft');
  await press('Escape');
  const h9 = await st();
  await runMenu('Tools', 'Show Comments');
  const h10 = await st(), draft = await ev(() => window.__pane().text);
  ok('Escape, then Tools > Show Comments: the draft reply is still in the field', !h9.open && h10.open
    && h10.mode === 'reply' && draft === 'Draft', { h9, h10, draft });
  await pane('select', 2);
  await pane('press', 'Edit');
  const h11 = await st();
  ok('Edit of another comment with the draft there: a beep, said so, the draft kept', h11.beeps === h10.beeps + 1
    && /Post it, or Cancel it first/.test(h11.msg) && h11.mode === 'reply'
    && (await ev(() => window.__pane().text)) === 'Draft', h11);
  await clickIcon('pane', 'button:Cancel');

  // Cancel changes nothing; Escape; Ctrl+Alt+M
  const c0 = await st();
  await pane('select', 2);
  await clickIcon('pane', 'button:Reply');
  await page.keyboard.type('Never mind');
  await clickIcon('pane', 'button:Cancel');
  const c1 = await st();
  ok('the field\'s Cancel: no mode, nothing written', c1.mode === null && c1.depth === c0.depth
    && JSON.stringify(c1.cm) === JSON.stringify(c0.cm), c1);
  await press('Escape');
  const x1 = await st();
  ok('Escape hides the pane, the caret back in the document, no comment chosen', !x1.open && x1.caretInDoc
    && x1.comment === null, x1);
  await caretIn(4, 0, 9);
  await press('Control+Alt+m');
  const k1 = await st();
  ok('Ctrl+Alt+M: the pane for a new comment', k1.open && k1.mode === 'add' && k1.depth === x1.depth, k1);
  await clickIcon('pane', 'button:Cancel');

  // the header and footer mode
  await caretIn(1, 0);
  await runMenu('View', 'Header and footer');
  const h0 = await st(), hm = await menuItem('Insert', 'Comment...');
  ok('in the header and footer mode Insert > Comment... is shaded', h0.hdr && hm && hm.shaded, { h0, hm });
  await press('Control+Alt+m');
  const h1 = await st();
  ok('Ctrl+Alt+M there beeps, no pane mode', h1.beeps === h0.beeps + 1 && h1.mode === null, h1);
  // (no pane call since the mode was entered: only the mode's own
  // refresh can have shaded it)
  await ev(async () => { await window.__frames(3); });
  const sh = await ev(() => window.__pane().selected !== null
    && window.__pane().win.iconByName('button:Reply').shaded);
  await pane('select', 1);
  await ev(() => { const w = window.__pane().win; w.iconByName('msg').setText(''); w.iconByName('msg2').setText(''); });
  const h2a = await st();
  await pane('press', 'Reply');
  const h2 = await st();
  ok('the pane\'s Reply there: shaded on entering the mode; pressed: a beep and the refusal\'s reason, nothing written', sh
    && h2a.msg === '' && h2.beeps === h2a.beeps + 1 && /cannot be changed in a header or footer/.test(h2.msg)
    && h2.depth === h2a.depth && h2.mode === null, { sh, h2a, h2 });
  await ev(() => window.__doc('Cm').dw.view.focus());
  await press('Escape');
  await ev(async () => { await window.__frames(3); });
  const sh2 = await ev(() => ({ hdr: !!window.__doc('Cm').dw.view.hdr,
    shaded: window.__pane().win.iconByName('button:Reply').shaded }));
  ok('leaving the mode: Reply live again', !sh2.hdr && sh2.shaded === false, sh2);

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
