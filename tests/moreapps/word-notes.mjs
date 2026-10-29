// !Letters' footnotes and endnotes in the real desktop (Batch E2):
// the notes mode. A document with one footnote (mark after "beta")
// and one endnote (mark in the last paragraph) opens in Print
// layout. Ctrl+Alt+F after "Alpha" puts a footnote there and enters
// the notes mode on it: the caret in the new note at the page's
// foot, the body dimmed, the info line "Footnote 1"; typing shows in
// the note at the foot (one undo step); Escape goes back to the body,
// the caret right after the new mark. A double-click on the old
// note's text at the foot enters it; Alt+Down goes to the next note
// (the endnote) and Alt+Up back; Escape; a double-click on a mark in
// the body enters its note. The new mark deleted in the body takes
// its note off the page (one step), Ctrl+Z puts both back. Insert >
// Endnote (the window menu) enters a new endnote where the run after
// the text shows it; the window made smaller keeps the caret in
// view; Draft view leaves the mode and Insert > Footnote from Draft
// shows Print layout first. Insert > Footnote is shaded in the mode
// (no note in a note) and Ctrl+Alt+F there beeps. The clipboard:
// Ctrl+X over "beta" and its mark takes the note too; Ctrl+V at the
// end of the text puts the phrase, a mark and a copy of the note
// (a new id) back in one step; Ctrl+Z takes them away; Ctrl+V in a
// note pastes the text without the mark, with a beep. Insert >
// Footnote and Endnote... opens the box with Word's defaults;
// Cancel changes nothing; a, b, c and Apply show
// the marks a, b (one step); Start at 5; Start at 0 refused in the
// box; Below text moves the note up; Whole document without a
// settings part refused; Restart each page written; the box asked
// again refills; a caret moved while it is open makes the button
// beep and refill; no settings part: Whole document shaded in its
// popup; Escape gives the caret back; Insert with Show: Endnotes
// writes the endnote format and enters a new endnote in one step;
// Insert with Custom mark * makes a note marked *. Then, in a fresh copy
// of the document: Convert... opens the Convert Notes box; This note
// with the caret after the footnote's mark makes it an endnote (one
// step): it leaves the foot of page 1 and shows in the run after the
// text on the last page; Ctrl+Z puts it back at the foot. A new
// footnote before it; Custom mark * and Set: the old note's mark and
// the note itself show *, the new note keeps its 1 (the custom one
// is not counted); Clear numbers it 2 again; Set after the caret
// moved is refused and refills the box; all endnotes to footnotes
// refills the parent box; in the notes mode a conversion with
// nothing to do keeps the mode. Needs the disc built by
// tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r, REL, W_NS, R_NS } from './build-docx.mjs';
import { mark, noteP, emark, enoteP, SEPS } from './note-fixtures.mjs';
import { BODY } from './hf-fixtures.mjs';

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const en = (attrs, body) => `<w:endnote ${attrs}>${body}</w:endnote>`;
const EN_SEPS = en('w:type="separator" w:id="-1"', p('<w:r><w:separator/></w:r>'))
  + en('w:type="continuationSeparator" w:id="0"', p('<w:r><w:continuationSeparator/></w:r>'));
const bytes = await buildDocx({
  'word/document.xml': documentXml(p(r('Alpha beta') + mark(1) + r(' gamma')) + BODY(70)
    + p(r('Last words') + emark(1))),
  'word/footnotes.xml': DECL + `<w:footnotes xmlns:w="${W_NS}" xmlns:r="${R_NS}">` + SEPS
    + `<w:footnote w:id="1">${noteP('Old note')}</w:footnote></w:footnotes>`,
  'word/endnotes.xml': DECL + `<w:endnotes xmlns:w="${W_NS}" xmlns:r="${R_NS}">` + EN_SEPS
    + en('w:id="1"', enoteP('Old endnote')) + '</w:endnotes>',
}, { docRels: [['rIdN1', REL('footnotes'), 'footnotes.xml'], ['rIdN2', REL('endnotes'), 'endnotes.xml']] });
const files = { Notes: Array.from(bytes) };
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);

const { browser, page, logs } = await launch({ height: 1000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE_URL).origin });
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
    window.__menu = (d, ...names) => {
      let items = d.win.menu({}).items, it = null;
      for (const n of names) {
        it = items.find((i) => i.text === n);
        if (!it) return null;
        if (it.submenu) items = it.submenu().items;
      }
      return it;
    };
    /** The texts d's window draws in one redraw, with their work-area x, y; and the DIM fills. */
    window.__drawn = async (d) => {
      const proto = CanvasRenderingContext2D.prototype, real = proto.fillText, realR = proto.fillRect, seen = [], dims = [];
      const cv = d.win._canvas, k = cv.width / d.win.w;
      proto.fillText = function (t, x, y, ...a) {
        if (this.canvas === cv) {
          const m = this.getTransform();
          seen.push([String(t), (m.a * x + m.c * y + m.e) / k + d.win.scrollX, (m.b * x + m.d * y + m.f) / k + d.win.scrollY]);
        }
        return real.call(this, t, x, y, ...a);
      };
      proto.fillRect = function (x, y, w, h) {
        if (this.canvas === cv && String(this.fillStyle).replace(/\s/g, '') === 'rgba(255,255,255,0.5)') dims.push([x, y, w, h]);
        return realR.call(this, x, y, w, h);
      };
      try {
        d.win.invalidate();
        await window.__frames(2);
      } finally {
        proto.fillText = real;
        proto.fillRect = realR;
      }
      return { seen, dims };
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
  }, files);

  const settle = () => ev(() => window.__frames(4));
  const press = async (k) => { await page.keyboard.press(k); await settle(); };
  /** Work-area point (zoomed) -> client point, scrolled into view first. */
  const showAt = (x, y) => ev(async ([x, y]) => {
    const d = window.__doc('Notes'), w = d.win;
    w.scrollTo(Math.max(0, Math.round(x - w.w / 2)), Math.max(0, Math.round(y - w.h / 2)));
    await window.__frames(2);
    const s = w.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
    return { x: rc.left + s.x * k, y: rc.top + s.y * k };
  }, [x, y]);
  /** The window's mode, caret, notes and where the caret is drawn against page i's foot. */
  const state = () => ev(() => {
    const d = window.__doc('Notes'), v = d.dw.view, m = v.hdr, doc = d.dw.doc, head = v.sel && v.sel.head;
    const B = v.bodyL, P = B.place && B.place.pages, z = v.zoom, t = B.top;
    const notes = (k) => [...doc.notes[k]].filter(([, n]) => n.type === 'normal').map(([id, n]) => [id, n.blocks.map((b) => b.text.replace(/￼/g, '#')).join('|')]);
    const c = v.caretRect();
    let foot = null;
    if (m && m.i >= 0 && P) {
      const pg = P.at(m.i), rc = B.place.sheet.rect(pg), cy = c ? t + (c.y - t) / z : null;
      foot = { page: m.i, inFoot: !!pg.notes && cy >= rc.y + pg.bodyTop + pg.notes.y - 2 && cy <= rc.y + pg.bodyTop + pg.notes.y + pg.notes.h,
        inPage: cy >= rc.y && cy <= rc.y + rc.h, last: m.i === P.count - 1 };
    }
    const p0 = doc.sections[0].blocks[0];
    const bs = doc.sections[doc.sections.length - 1].blocks, pl = bs[bs.length - 1];
    return { mode: m ? { kind: m.kind, note: m.note || null } : null, head, foot, view: d.dw.viewName,
      last: pl.text.replace(/￼/g, '#'), route: d.dw.clip && d.dw.clip.last,
      depth: d.d.undoDepth, foot1: notes('footnotes'), end1: notes('endnotes'),
      p0: { id: p0.id, text: p0.text.replace(/￼/g, '#') }, info: d.toolbar2.text('pageInfo'),
      caretVisible: !!c && c.y >= d.win.scrollY && c.y + c.h <= d.win.scrollY + d.win.h,
      beeps: window.__beeps };
  });

  // ------------------------------------------------ open; Ctrl+Alt+F after "Alpha"
  const o = await ev(async () => {
    const d = await window.__open('Notes');
    d.win.open({ x: 60, y: 40, w: 1000, h: 800, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    d.dw.L.place.pages.finish();
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    const v = d.dw.view, p0 = d.dw.doc.sections[0].blocks[0];
    v.setSelection({ anchor: { id: p0.id, off: 5 }, head: { id: p0.id, off: 5 }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
    return { view: d.dw.viewName, pages: d.dw.L.place.pages.count };
  });
  ok('the document opens in Print layout, more than one page', o.view === 'print' && o.pages > 1, o);
  const s0 = await state();
  await press('Control+Alt+f');
  const s1 = await state();
  const newId = s1.mode && s1.mode.note && s1.mode.note.id;
  ok('Ctrl+Alt+F: a footnote mark after "Alpha" and the notes mode on the new note',
    s1.mode && s1.mode.kind === 'note' && s1.mode.note.kind === 'footnote' && s1.p0.text === 'Alpha# beta# gamma'
      && s1.foot1.some(([id, t]) => id === newId && t === '# '), s1);
  ok('... one undo step', s1.depth === s0.depth + 1, s1);
  ok('... the caret in the new note at the foot of page 1', s1.foot && s1.foot.inFoot && s1.foot.page === 0, s1);
  ok('... the info line names it: Footnote 1 (it comes first)', /Footnote 1$/.test(s1.info), s1.info);
  const dr1 = await ev(() => window.__drawn(window.__doc('Notes')));
  ok('... the body is dimmed (50% white over the page, its notes left clear)', dr1.dims.length > 0, dr1.dims.length);

  // typing in the note
  await page.keyboard.type('Hello note');
  await settle();
  const s2 = await state();
  ok('typing goes into the note, the body unchanged', s2.foot1.some(([id, t]) => id === newId && t === '# Hello note')
    && s2.p0.text === s1.p0.text, s2);
  const dr2 = await ev(async () => {
    const d = window.__doc('Notes'), L = d.dw.view.bodyL, pg = L.place.pages.at(0), rc = L.place.sheet.rect(pg);
    d.win.scrollTo(0, Math.max(0, rc.y + rc.h - d.win.h + 4));
    await window.__frames(2);
    const { seen } = await window.__drawn(d);
    return seen.filter(([, , y]) => y > rc.y + pg.bodyTop + pg.notes.y && y < rc.y + rc.h).map(([t]) => t).join(' ');
  });
  ok('... and is drawn at the foot of page 1', /Hello/.test(dr2) && /Old/.test(dr2), dr2);
  await press('Escape');
  const s3 = await state();
  ok('Escape: back in the body, the caret right after the new mark', !s3.mode && s3.head && s3.head.id === s3.p0.id && s3.head.off === 6, s3);

  // a double-click on the old note's text at the foot
  const oldSpot = await ev(() => {
    const d = window.__doc('Notes'), v = d.dw.view, L = v.bodyL, P = L.place.pages, pg = P.at(0), rc = L.place.sheet.rect(pg);
    const geo = L.geom(pg.s), f = pg.notes, pc = f.pieces.find((x) => x.id === 1);
    return { x: (rc.x + geo.mar.left + 60) * v.zoom, y: L.top + (rc.y + Math.round(pg.bodyTop + f.y) + pc.y + 6 - L.top) * v.zoom };
  });
  let c = await showAt(oldSpot.x, oldSpot.y);
  await page.mouse.dblclick(c.x, c.y);
  await settle();
  const s4 = await state();
  ok('a double-click on a note\'s text at the foot enters that note', s4.mode && s4.mode.note && s4.mode.note.id === 1
    && s4.mode.note.kind === 'footnote' && s4.foot && s4.foot.inFoot, s4);
  ok('... no undo step for entering', s4.depth === s2.depth, s4);
  await press('Alt+ArrowDown');
  const s5 = await state();
  ok('Alt+Down: the next note, the endnote (where the run after the text shows it)',
    s5.mode && s5.mode.note && s5.mode.note.kind === 'endnote' && s5.mode.note.id === 1 && s5.foot && s5.foot.inPage
      && s5.foot.last && s5.foot.page > 0, s5);
  await press('Alt+ArrowUp');
  await press('Alt+ArrowUp');
  const s6 = await state();
  ok('Alt+Up twice: back to the new footnote, the first', s6.mode && s6.mode.note && s6.mode.note.id === newId, s6);
  const b6 = s6.beeps;
  await press('Alt+ArrowUp');
  const s6b = await state();
  ok('... Alt+Up at the first note: a beep, the mode stays', s6b.beeps === b6 + 1 && s6b.mode && s6b.mode.note.id === newId, s6b);
  // a note in a note: refused
  const shaded = await ev(() => {
    const it = window.__menu(window.__doc('Notes'), 'Insert', 'Footnote');
    return it ? (typeof it.shaded === 'function' ? it.shaded() : it.shaded) : 'none';
  });
  await press('Control+Alt+f');
  const s7 = await state();
  ok('in the mode Insert > Footnote is shaded and Ctrl+Alt+F beeps (no note in a note)',
    shaded === true && s7.beeps === s6b.beeps + 1 && s7.depth === s6b.depth, { shaded, s7 });
  const noteMenu = await ev(() => window.__doc('Notes').win.menu({}).items.map((i) => i.text));
  ok('... the window menu has the mode\'s Footnote item', noteMenu.includes('Footnote'), noteMenu);
  await press('Escape');

  // a double-click on the old mark in the body
  const markSpot = await ev(() => {
    const d = window.__doc('Notes'), v = d.dw.view, L = v.bodyL, p0 = d.dw.doc.sections[0].blocks[0];
    const off = p0.text.indexOf('￼', 7);
    const a = L.caretRect({ id: p0.id, off }, 'down'), b = L.caretRect({ id: p0.id, off: off + 1 }, 'up');
    return { x: ((a.x + b.x) / 2) * v.zoom, y: L.top + (a.y + a.h / 2 - L.top) * v.zoom };
  });
  c = await showAt(markSpot.x, markSpot.y);
  await page.mouse.dblclick(c.x, c.y);
  await settle();
  const s8 = await state();
  ok('a double-click on a mark in the body enters its note', s8.mode && s8.mode.note && s8.mode.note.id === 1, s8);
  await press('Escape');

  // the new mark deleted in the body: its note goes; undo puts both back
  await ev(async () => {
    const d = window.__doc('Notes'), v = d.dw.view, p0 = d.dw.doc.sections[0].blocks[0];
    v.setSelection({ anchor: { id: p0.id, off: 6 }, head: { id: p0.id, off: 6 }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  });
  const s9a = await state();
  await press('Backspace');
  const s9 = await state();
  const footText = () => ev(async () => {
    const d = window.__doc('Notes'), L = d.dw.view.bodyL, pg = L.place.pages.at(0), rc = L.place.sheet.rect(pg);
    d.win.scrollTo(0, Math.max(0, rc.y + rc.h - d.win.h + 4));
    await window.__frames(2);
    const { seen } = await window.__drawn(d);
    return seen.filter(([, , y]) => y > rc.y + pg.bodyTop + (pg.notes ? pg.notes.y : pg.frameH) && y < rc.y + rc.h).map(([t]) => t).join(' ');
  });
  const f9 = await footText();
  ok('Backspace over the new mark takes its note: one undo step, gone from the page',
    s9.p0.text === 'Alpha beta# gamma' && !s9.foot1.some(([id]) => id === newId) && s9.depth === s9a.depth + 1 && !/Hello/.test(f9)
      && /Old/.test(f9), { s9, f9 });
  await press('Control+z');
  const s10 = await state(), f10 = await footText();
  ok('Ctrl+Z puts the mark and the note back, shown at the foot again', s10.p0.text === 'Alpha# beta# gamma'
    && s10.foot1.some(([id, t]) => id === newId && t === '# Hello note') && /Hello/.test(f10), { s10, f10 });

  // undo of a note edit from the body enters the note
  await press('Control+z');
  const s11 = await state();
  ok('Ctrl+Z again from the body undoes the note\'s typing (its last word) and enters that note',
    s11.mode && s11.mode.note && s11.mode.note.id === newId && s11.foot1.some(([id, t]) => id === newId && t === '# Hello ')
      && s11.foot && s11.foot.inFoot, s11);
  await press('Escape');

  // Insert > Endnote from the window menu
  await ev(async () => {
    const d = window.__doc('Notes'), v = d.dw.view, p0 = d.dw.doc.sections[0].blocks[0];
    v.setSelection({ anchor: { id: p0.id, off: 3 }, head: { id: p0.id, off: 3 }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
    window.__menu(d, 'Insert', 'Endnote').action();
    await window.__frames(4);
  });
  const s12 = await state();
  const enId = s12.mode && s12.mode.note && s12.mode.note.id;
  ok('Insert > Endnote: a new endnote and the mode on it, the caret where the run shows it',
    s12.mode && s12.mode.note.kind === 'endnote' && s12.end1.length === 2 && s12.foot && s12.foot.inPage && s12.foot.last, s12);
  await page.keyboard.type('End text');
  await settle();
  const s13 = await state();
  ok('... typing goes into the endnote', s13.end1.some(([id, t]) => id === enId && t === '# End text'), s13);
  // a smaller window keeps the caret in view
  await ev(async () => {
    const d = window.__doc('Notes');
    d.win.open({ x: 60, y: 40, w: 640, h: 420, behind: 'top', scrollX: d.win.scrollX, scrollY: d.win.scrollY });
    await window.__frames(4);
    d.dw.view.scrollToCaret();
    await window.__frames(2);
  });
  const s14 = await state();
  ok('the window made smaller: the caret in view, still in the endnote', s14.caretVisible && s14.mode && s14.mode.note.id === enId, s14);
  // Draft leaves; Insert > Footnote from Draft shows Print layout first
  await ev(async () => { window.__menu(window.__doc('Notes'), 'View', 'Draft').action(); await window.__frames(4); });
  const s15 = await state();
  ok('Draft view leaves the mode', !s15.mode && s15.view === 'draft', s15);
  await ev(async () => {
    const d = window.__doc('Notes'), v = d.dw.view, p0 = d.dw.doc.sections[0].blocks[0];
    v.setSelection({ anchor: { id: p0.id, off: 1 }, head: { id: p0.id, off: 1 }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
    window.__menu(d, 'Insert', 'Footnote').action();
    await window.__frames(4);
  });
  const s16 = await state();
  ok('Insert > Footnote from Draft: Print layout, the mode on the new note at the foot',
    s16.view === 'print' && s16.mode && s16.mode.note.kind === 'footnote' && s16.foot && s16.foot.inFoot, s16);
  await press('Escape');

  // cut and paste of a phrase with a mark: the note goes and comes back
  await ev(async () => {
    const d = window.__doc('Notes'), v = d.dw.view, p0 = d.dw.doc.sections[0].blocks[0];
    const m = Object.keys(p0.inlines).find((k) => p0.inlines[k].kind === 'noteRef' && p0.inlines[k].note === 'footnote'
      && p0.inlines[k].id === 1);
    v.setSelection({ anchor: { id: p0.id, off: p0.text.indexOf('beta') }, head: { id: p0.id, off: +m + 1 }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  });
  const c0 = await state();
  await press(MOD + '+x');
  const c1 = await state();
  ok('Cut (Ctrl+X) over "beta" and its mark: the phrase and its note go, one undo step',
    !/beta/.test(c1.p0.text) && !c1.foot1.some(([id]) => id === 1) && c1.depth === c0.depth + 1, c1);
  await ev(async () => {
    const d = window.__doc('Notes'), v = d.dw.view, bs = d.dw.doc.sections[0].blocks, pl = bs[bs.length - 1];
    v.setSelection({ anchor: { id: pl.id, off: pl.text.length }, head: { id: pl.id, off: pl.text.length }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  });
  await press(MOD + '+v');
  const c2 = await state();
  const back = c2.foot1.find(([, t]) => t === '# Old note');
  ok('Paste (Ctrl+V) at the end: the phrase and a mark back, a copy of the note under a new id, one undo step',
    c2.route === 'exact' && /beta#$/.test(c2.last) && back && back[0] !== 1 && c2.depth === c1.depth + 1
      && c2.foot1.length === c1.foot1.length + 1, c2);
  await press('Control+z');
  const c3 = await state();
  ok('Ctrl+Z takes the pasted mark and its note away', !/beta/.test(c3.last)
    && !c3.foot1.some(([, t]) => t === '# Old note') && c3.depth === c1.depth, c3);
  await press('Control+Alt+f');
  const c4 = await state();
  await press(MOD + '+v');
  const c5 = await state();
  const into = c5.mode && c5.mode.note && c5.foot1.find(([id]) => id === c5.mode.note.id);
  ok('Paste in a note: the text without its mark, a beep, no new note',
    c4.mode && into && into[1] === '# beta' && c5.beeps === c4.beeps + 1
      && c5.foot1.length === c4.foot1.length, { c4, c5 });
  await press('Escape');

  // the Footnote and Endnote box (Insert > Footnote and Endnote...)
  const nbox = () => ev(() => {
    const d = window.__doc('Notes');
    return d.dw.boxes.has('notes') ? window.__word().word.dialog({ key: 'notes:' + d.dw.docKey, rows: [] }) : null;
  });
  const NB = {
    open: () => ev(async () => {
      const it = window.__menu(window.__doc('Notes'), 'Insert', 'Footnote and Endnote...');
      if (!it || (typeof it.shaded === 'function' ? it.shaded(it) : it.shaded)) return false;
      it.action(it);
      await window.__frames(3);
      return true;
    }),
    get: () => ev(() => { const d = window.__doc('Notes'), b = window.__word().word.dialog({ key: 'notes:' + d.dw.docKey, rows: [] });
      return b.isOpen ? { ...b.values(), shadedConvert: b.win.iconByName('convert').shaded } : null; }),
    set: (name, v) => ev(([n, x]) => { const d = window.__doc('Notes'); window.__word().word.dialog({ key: 'notes:' + d.dw.docKey, rows: [] }).set(n, x); }, [name, v]),
    click: async (name) => {
      const c = await ev((n) => {
        const d = window.__doc('Notes'), b = window.__word().word.dialog({ key: 'notes:' + d.dw.docKey, rows: [] });
        const ic = b.win.iconByName(/^[A-Z]/.test(n) ? 'button:' + n : n), bb = ic.bbox, s = b.win.workToScreen((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2);
        const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
        return { x: rc.left + s.x * k, y: rc.top + s.y * k };
      }, name);
      await page.mouse.click(c.x, c.y);
      await settle();
    },
  };
  const caretAt = (off) => ev(async (off) => {
    const d = window.__doc('Notes'), v = d.dw.view, p0 = d.dw.doc.sections[0].blocks[0];
    v.setSelection({ anchor: { id: p0.id, off }, head: { id: p0.id, off }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  }, off);
  const nstate = () => ev(async () => {
    const d = window.__doc('Notes'), v = d.dw.view, doc = d.dw.doc;
    const kids = (k) => { const x = doc.sections[0].props.extra.find((c) => c.name === 'w:' + k + 'Pr');
      return x ? x.children.map((c) => c.name.replace('w:', '') + '=' + (c.attrs.find(([a]) => a === 'w:val') || [])[1]) : []; };
    const { seen } = await window.__drawn(d);
    const P = v.bodyL.place && v.bodyL.place.pages;
    return { depth: d.d.undoDepth, fkids: kids('footnote'), ekids: kids('endnote'),
      marks: seen.map((t) => t[0]).filter((t) => /^[a-eA-E1-5ivIVx]{1,3}$/.test(t)),
      noteY: P && P.at(0).notes ? P.at(0).notes.y : null, mode: v.hdr ? { kind: v.hdr.kind, note: v.hdr.note || null } : null };
  });
  await ev(() => { window.__doc('Notes').dw.view.setSelection; });
  await ev(async () => { window.__menu(window.__doc('Notes'), 'View', 'Print layout')?.action(); await window.__frames(3); });
  await caretAt(3);
  const nbn0 = await nstate();
  ok('Insert > Footnote and Endnote... is there and opens the box', await NB.open());
  const nbb1 = await NB.get();
  ok('... with the caret section\'s options (Word\'s defaults), Convert... there',
    nbb1 && nbb1.show === 'footnote' && nbb1.pos === 'pageBottom' && nbb1.numFmt === 'decimal' && nbb1.numStart === 1
      && nbb1.numRestart === 'continuous' && nbb1.scope === 'section' && nbb1.shadedConvert === false, nbb1);
  await NB.click('Cancel');
  ok('Cancel closes it and changes nothing', !(await nbox()) && (await nstate()).depth === nbn0.depth, await nstate());
  await NB.open();
  await NB.set('numFmt', 'lowerLetter');
  await NB.click('Apply');
  const nbn1 = await nstate();
  ok('number format a, b, c and Apply: the marks show a, one undo step, box gone',
    !(await nbox()) && nbn1.depth === nbn0.depth + 1 && nbn1.fkids.join() === 'numFmt=lowerLetter'
      && nbn1.marks.includes('a') && !nbn0.marks.includes('a'), { nbn0, nbn1 });
  await NB.open();
  const nbb2 = await NB.get();
  await NB.set('numStart', 5);
  await NB.click('Apply');
  const nbn2 = await nstate();
  ok('Start at 5: the mark shows e; the box had refilled with the saved a, b, c',
    nbb2.numFmt === 'lowerLetter' && nbn2.marks.includes('e') && nbn2.fkids.includes('numStart=5'), { nbb2, nbn2 });
  await NB.open();
  await NB.set('numStart', 0);
  await NB.click('Apply');
  const nbb3 = await NB.get();
  const nbn3 = await nstate();
  ok('Start at 0 is refused with a message, the box kept, nothing written',
    nbb3 && /1 to 16383/.test(nbb3.msg) && nbn3.depth === nbn2.depth, { nbb3, nbn3 });
  await NB.set('numStart', 5);
  await NB.set('pos', 'beneathText');
  await NB.click('Apply');
  const nbn4 = await nstate();
  ok('Below text: the note moves up the page from the foot', nbn4.fkids.includes('pos=beneathText')
    && nbn4.noteY !== null && nbn4.noteY < nbn2.noteY - 1, { nbn2, nbn4 });
  await NB.open();
  await NB.set('numRestart', 'eachPage');
  await NB.set('scope', 'all');
  await NB.click('Apply');
  const nbb5 = await NB.get();
  ok('Whole document in a document with no settings part is refused in the box', nbb5 && /settings/.test(nbb5.msg), nbb5);
  await NB.set('scope', 'section');
  await NB.click('Apply');
  const nbn5 = await nstate();
  ok('Restart each page (This section) is written', !(await nbox()) && nbn5.fkids.includes('numRestart=eachPage'), nbn5);
  // asked again while open: refilled
  await NB.open();
  await NB.set('numFmt', 'upperRoman');
  await NB.open();
  const nbb6 = await NB.get();
  ok('asked again while open: the box refills from the document', nbb6 && nbb6.numFmt === 'lowerLetter', nbb6);
  // no settings part: Whole document shaded in the popup up front
  await NB.click('arrow:scope');
  const nbsc = await ev(() => { const lv = os.wimp.menus.levels[0];
    const r = { open: os.wimp.menus.isOpen, rows: lv?.rows.map((x) => [x.item.text,
      typeof x.item.shaded === 'function' ? x.item.shaded() : !!x.item.shaded]) };
    os.wimp.menus.close(); return r; });
  ok('no settings part: the Apply changes to popup shows Whole document shaded', nbsc.open
    && JSON.stringify(nbsc.rows) === JSON.stringify([['This section', false], ['Whole document', true]]), nbsc);
  // Escape (and the close icon) give the caret back to the document
  await press('Escape');
  const nbesc = await ev(() => { const d = window.__doc('Notes');
    return { gone: !d.dw.boxes.has('notes') || !window.__word().word.dialog({ key: 'notes:' + d.dw.docKey, rows: [] }).isOpen,
      caret: os.wimp.caret?.window === d.dw.win }; });
  ok('Escape closes the box and the caret is back in the document', nbesc.gone && nbesc.caret, nbesc);
  await NB.open();
  // Insert: the endnote options and a new endnote in one step
  await NB.click('showendnote');
  const nbb7 = await NB.get();
  ok('Show Endnotes: the fields hold the endnote options', nbb7.pos === 'docEnd' && nbb7.numFmt === 'decimal' && nbb7.numRestart === 'continuous', nbb7);
  await NB.set('numFmt', 'upperRoman');
  await caretAt(1);
  await NB.click('Insert');
  const nbs = await NB.get();
  ok('the caret moved while the box was open: the button beeps, refills the box and says so',
    nbs && /changed while the box was open/.test(nbs.msg) && nbs.show === 'footnote' && nbs.numFmt === 'lowerLetter', nbs);
  await NB.click('showendnote');
  await NB.set('numFmt', 'upperRoman');
  await NB.click('Insert');
  const nbn7 = await nstate();
  ok('Insert: the endnote options written, a new endnote and the notes mode on it, one undo step',
    !(await nbox()) && nbn7.mode && nbn7.mode.note.kind === 'endnote' && nbn7.ekids.includes('numFmt=upperRoman')
      && nbn7.depth === nbn5.depth + 1, { nbn5, nbn7 });
  await press('Escape');
  await press('Control+z');
  const nbn8 = await nstate();
  ok('Ctrl+Z takes the endnote and the option back together', nbn8.depth === nbn5.depth && nbn8.ekids.length === 0, nbn8);
  // Insert with the Custom mark field holding *: a note marked *, one step
  await caretAt(3);
  await NB.open();
  await NB.set('custom', '*');
  await NB.click('Insert');
  const nbcm = await ev(() => { const d = window.__doc('Notes'), v = d.dw.view, p0 = d.dw.doc.sections[0].blocks[0];
    const x = Object.values(p0.inlines).find((y) => y.kind === 'noteRef' && y.custom === '*');
    const n = x ? d.dw.doc.notes.footnotes.get(x.id) : null;
    return { depth: d.d.undoDepth, mode: !!(v.hdr && v.hdr.note), custom: !!x, note: n ? n.blocks[0].text : null,
      off: v.sel && v.sel.head.off }; });
  ok('Insert with Custom mark *: a footnote marked *, the notes mode in it after "* ", one undo step',
    !(await nbox()) && nbcm.mode && nbcm.custom && /^\* /.test(nbcm.note) && nbcm.off === 2
      && nbcm.depth === nbn8.depth + 1, { nbn8, nbcm });
  await press('Escape');
  await press('Control+z');
  const nbn9 = await nstate();
  ok('... Ctrl+Z takes it away', nbn9.depth === nbn8.depth, nbn9);

  // Insert next to a custom-marked note: the box shows its mark for
  // Set and Clear, but Insert uses the field only when it was changed
  const customs = () => ev(() => { const d = window.__doc('Notes');
    return Object.values(d.dw.doc.sections[0].blocks[0].inlines)
      .filter((y) => y.kind === 'noteRef').map((y) => y.custom || null); });
  const mk = async (text) => { await caretAt(3); await NB.open(); await NB.set('custom', text);
    await NB.click('Insert'); await press('Escape'); };
  const prefilled = async (edit) => { await mk('*');
    await NB.open(); const pre = (await NB.get()).custom;
    if (edit !== undefined) await NB.set('custom', edit);
    await NB.click('Insert'); await press('Escape'); return { pre, marks: await customs() }; };
  const undo2 = async () => { await press('Control+z'); await press('Control+z'); };
  const pa = await prefilled();
  ok('Insert with the field pre-filled * and untouched: a numbered note (no custom mark)',
    pa.pre === '*' && pa.marks.filter((c) => c === '*').length === 1, pa);
  await undo2();
  const pb = await prefilled('#');
  ok('... pre-filled * and # typed: a note marked #',
    pb.pre === '*' && pb.marks.includes('#') && pb.marks.includes('*'), pb);
  await undo2();
  const pc = await prefilled('');
  ok('... pre-filled * and the field cleared: a numbered note',
    pc.pre === '*' && pc.marks.filter((c) => c === '*').length === 1, pc);
  await undo2();
  // the box refilled while open (the caret moved): the new pre-fill is the baseline
  await mk('*');
  const nstale = (await customs()).length;
  await NB.open();
  await NB.set('custom', '#');
  await caretAt(1);
  await NB.click('Insert');
  const pf = await NB.get();
  ok('... a stale typed # is replaced by the refill, nothing inserted', (await customs()).length === nstale && pf && (pf.custom ?? '') === '', { pf });
  await press('Escape');
  await press('Control+z');

  await ev(() => window.__doc('Notes').dw.close());

  // ------------------------------------------------ Convert... and Custom mark (a fresh copy)
  await ev(async () => {
    const d = await window.__open('Notes');
    d.win.open({ x: 60, y: 40, w: 1000, h: 800, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    d.dw.L.place.pages.finish();
  });
  /** Where each note starts: [kind, id, page index] (the foot's pieces, the run's first fragments). */
  const places = () => ev(async () => {
    const d = window.__doc('Notes'), P = d.dw.view.bodyL.place.pages;
    P.finish();
    await window.__frames(2);
    const out = [], items = P.G && P.G.items;
    for (let i = 0; P.at(i); i++) {
      const pg = P.at(i);
      if (pg.blank) continue;
      for (const pc of pg.notes ? pg.notes.pieces : []) if (pc.from === 0) out.push(['footnote', pc.id, i]);
      for (const fr of pg.frames || []) {
        fr.frags.forEach((f, j) => {
          const it = f.en && items ? items[fr.start.k + j] : null;
          if (it && it.en && it.en.first) out.push([it.en.kind, it.en.id, i]);
        });
      }
    }
    return { out, count: P.count };
  });
  const CB = {
    get: () => ev(() => { const d = window.__doc('Notes');
      if (!d.dw.boxes.has('noteconv')) return null;
      const b = window.__word().word.dialog({ key: 'noteconv:' + d.dw.docKey, rows: [] });
      return b.isOpen ? b.values() : null; }),
    set: (name, v) => ev(([n, x]) => { const d = window.__doc('Notes'); window.__word().word.dialog({ key: 'noteconv:' + d.dw.docKey, rows: [] }).set(n, x); }, [name, v]),
    click: async (name) => {
      const c = await ev((n) => {
        const d = window.__doc('Notes'), b = window.__word().word.dialog({ key: 'noteconv:' + d.dw.docKey, rows: [] });
        const ic = b.win.iconByName(/^[A-Z]/.test(n) ? 'button:' + n : n), bb = ic.bbox, s = b.win.workToScreen((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2);
        const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
        return { x: rc.left + s.x * k, y: rc.top + s.y * k };
      }, name);
      await page.mouse.click(c.x, c.y);
      await settle();
    },
  };
  /** The texts drawn with the window scrolled to page 0's top (top) or its foot. */
  const drawnAt = (where) => ev(async (where) => {
    const d = window.__doc('Notes'), L = d.dw.view.bodyL, pg = L.place.pages.at(0), rc = L.place.sheet.rect(pg);
    d.win.scrollTo(0, where === 'top' ? 0 : Math.max(0, rc.y + rc.h - d.win.h + 4));
    await window.__frames(2);
    const { seen } = await window.__drawn(d);
    return seen.map((t) => t[0]);
  }, where);
  await caretAt(11);
  const cv0 = await state(), pl0 = await places();
  ok('a fresh copy: the footnote at the foot of page 1, the endnote in the run on the last page',
    pl0.out.some(([k, id, i]) => k === 'footnote' && id === 1 && i === 0)
      && pl0.out.some(([k, id, i]) => k === 'endnote' && id === 1 && i === pl0.count - 1), pl0);
  await NB.open();
  await NB.click('convert');
  const cb1 = await CB.get();
  ok('Convert... opens the Convert Notes box, This note chosen', cb1 && cb1.what === 'this', cb1);
  await CB.click('Convert');
  const cv1 = await state(), pl1 = await places();
  const moved = cv1.end1.find(([, t]) => t === '# Old note');
  ok('Convert (This note): the footnote is an endnote now (a new id), one undo step, the box gone',
    !(await CB.get()) && cv1.foot1.length === 0 && moved && moved[0] === 2 && cv1.depth === cv0.depth + 1
      && cv1.p0.text === cv0.p0.text, { cv0, cv1 });
  ok('... it leaves the foot of page 1 and shows in the run after the text, on the last page',
    !pl1.out.some(([k]) => k === 'footnote')
      && pl1.out.some(([k, id, i]) => k === 'endnote' && id === 2 && i === pl1.count - 1), pl1);
  await press('Control+z');
  const cv2 = await state(), pl2 = await places();
  ok('Ctrl+Z: a footnote at the foot of page 1 again',
    cv2.foot1.some(([id, t]) => id === 1 && t === '# Old note') && cv2.end1.length === 1
      && pl2.out.some(([k, id, i]) => k === 'footnote' && id === 1 && i === 0), { cv2, pl2 });
  // a new footnote after "Alpha", then a custom mark on the old one
  await caretAt(5);
  await press('Control+Alt+f');
  await press('Escape');
  await caretAt(12);
  const cv3 = await state();
  await NB.open();
  await NB.set('custom', '*');
  await NB.click('setMark');
  const cv4 = await state(), nbc = await NB.get();
  const top4 = await drawnAt('top'), foot4 = await drawnAt('foot');
  ok('Custom mark * and Set: the old note starts with *, one undo step, the box kept and showing it',
    cv4.foot1.some(([id, t]) => id === 1 && t === '* Old note') && cv4.depth === cv3.depth + 1
      && nbc && nbc.custom === '*' && /set/.test(nbc.msg), { cv3, cv4, nbc });
  ok('... * shows at the mark and in the note; the new note keeps its 1, no 2 drawn',
    top4.includes('*') && foot4.some((t) => t.startsWith('*')) && top4.includes('1') && !top4.includes('2'),
    { top4, foot4 });
  await NB.click('clearMark');
  const cv5 = await state(), top5 = await drawnAt('top');
  ok('Clear: the note numbered again (2), its own mark back',
    cv5.foot1.some(([id, t]) => id === 1 && t === '# Old note') && top5.includes('2') && !top5.includes('*')
      && cv5.depth === cv4.depth + 1, { cv5, top5 });
  // Set after the caret moved to another note's mark: stale, refused
  await NB.set('custom', '+');
  await caretAt(5);
  await NB.click('setMark');
  const cv6 = await state(), nb6 = await NB.get();
  ok('Set after the caret moved: a beep, the box filled again for the note by the caret now, nothing changed',
    nb6 && /changed while the box was open/.test(nb6.msg) && (nb6.custom ?? '') === '' && cv6.depth === cv5.depth
      && cv6.beeps === cv5.beeps + 1, { cv6, nb6 });
  // all endnotes to footnotes: the Footnote and Endnote box fills itself again
  await NB.click('convert');
  await CB.set('what', 'allEndnotes');
  await CB.click('Convert');
  const cv7 = await state(), nb7 = await NB.get();
  ok('Convert all endnotes to footnotes: none left, three footnotes; the parent box filled again',
    cv7.end1.length === 0 && cv7.foot1.length === 3 && cv7.depth === cv6.depth + 1 && nb7 && nb7.msg === '',
    { cv7, nb7 });
  // in the notes mode, a conversion that cannot run keeps the mode
  const spot2 = await ev(() => {
    const d = window.__doc('Notes'), v = d.dw.view, L = v.bodyL, p0 = d.dw.doc.sections[0].blocks[0];
    const off = p0.text.indexOf('\ufffc', 7);
    const a = L.caretRect({ id: p0.id, off }, 'down'), b = L.caretRect({ id: p0.id, off: off + 1 }, 'up');
    return { x: ((a.x + b.x) / 2) * v.zoom, y: L.top + (a.y + a.h / 2 - L.top) * v.zoom };
  });
  const cpt = await showAt(spot2.x, spot2.y);
  await page.mouse.dblclick(cpt.x, cpt.y);
  await settle();
  const cv8a = await state();
  await NB.click('convert');
  await CB.set('what', 'allEndnotes');
  await CB.click('Convert');
  const cv8 = await state(), cb8 = await CB.get();
  ok('in the notes mode, Convert with nothing to convert: a beep and a message, the mode kept, nothing changed',
    cv8a.mode && cv8.mode && cv8.mode.note && cv8.mode.note.id === cv8a.mode.note.id && cb8
      && /no note of that kind/.test(cb8.msg) && cv8.depth === cv8a.depth && cv8.beeps === cv8a.beeps + 1,
    { cv8a, cv8, cb8 });
  await CB.click('Cancel');
  await press('Escape');
  await NB.click('Cancel');
  await ev(() => window.__doc('Notes').dw.close());

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
