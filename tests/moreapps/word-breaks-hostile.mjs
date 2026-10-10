// !Word's page and section breaks against hostile input in the real
// desktop: 50,000 paragraphs take select all + Ctrl-Enter / a section
// break / the Page break before flag within generous bounds (times
// logged), and undo; 1000 Ctrl-Enter (100 real key presses, 900 by
// the command) leave a valid model and undo whole; 1000 section
// breaks (50 through the Insert menu) in a document, each command
// quick, painting after a scroll, undo whole; delete storms at
// section edges (Backspace at a section's start, Delete at its end,
// real keys and commands, over 500 sections); a select-all Backspace
// over 500 sections (every section stays, as the rule says: a range
// deleted across a break keeps the sections) and its undo; and 500
// seeded random actions (keys incl. Ctrl-Enter, Backspace, Delete,
// Enter, text, clicks and drags, the Insert menu's items, the break
// ids, the Page break before flag) with the selection and every
// block valid after each, and undo of everything giving back the
// opened model. No page errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { rng } from './word-docs.mjs';
import { checkBlock } from '../../tools/moreapps/!Word/ModelCheck';

const docx = async (body) => Array.from(await buildDocx({ 'word/document.xml': documentXml(body) }));
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const SECT = (i) => `<w:sectPr><w:type w:val="${['nextPage', 'continuous'][i % 2]}"/>` +
  `<w:pgSz w:w="${i % 7 === 3 ? 16838 : 11906}" w:h="${i % 7 === 3 ? 11906 : 16838}"/></w:sectPr>`;
const MIXED = Array.from({ length: 12 }, (_, i) => p(r(`Paragraph ${i} ` + WORDS[i % 10].repeat(6)), i === 5 ? SECT(1) : '')).join('') + p(r('The end.'));
const HUGE = Array.from({ length: 50000 }, (_, i) => p(r(`${i} ${WORDS[i % 10]} words`))).join('');
const SECTIONS = (n) => Array.from({ length: n }, (_, i) => p(r(`Section ${i} text`), SECT(i))).join('') + p(r('Last'));
const files = { Huge: await docx(HUGE), Mixed: await docx(MIXED), Spam: await docx(p(r('start text here'))), Secs: await docx(p(r('first'))),
  Storm: await docx(SECTIONS(500)), All: await docx(SECTIONS(500)) };

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const timings = [];
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const pageErrors = () => logs.filter((l) => /PAGEERROR/.test(l)).length;
const modelBad = (json) => {
  try {
    for (const s of JSON.parse(json)) for (const b of s.blocks) checkBlock(b);
    return '';
  } catch (e) {
    return e.message;
  }
};

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => d.path.endsWith('.' + leaf));
    window.__client = (w, x, y) => {
      const s = w.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    window.__open = async (leaf, at = {}) => {
      if (!window.__word()) await os.filer.run(`RAM::RamDisc0.$.${leaf}`);
      for (let i = 0; i < 400 && !window.__word(); i++) await window.__sleep(50);
      const real = await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      real.win.open({ x: 100, y: 60, w: 860, h: 480, ...at, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      real.view.focus();
      window.__cur = leaf;
      window.__real = real;
      return window.__doc(leaf);
    };
    window.__d = () => window.__doc(window.__cur);
    window.__json = (d) => JSON.stringify(d.d.doc.sections);
    window.__undoAll = (d) => { let n = 0; while (d.d.canUndo && n < 5000) { d.view.press('undo'); n++; } d.view.flush(); return n; };
    window.__at = (d, i, off = 0) => d.view.setSelection({ id: d.view.layout.items[i].id, off });
    window.__atEnd = (d, i) => d.view.setSelection({ id: d.view.layout.items[i].id, off: d.view.layout.items[i].block.text.length });
    window.__run = (d, id) => d.dw.view.run(id);
    window.__secs = (d) => d.d.doc.sections.length;
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    window.__bad = (d) => {
      const L = d.view.layout, s = d.view.selection;
      if (!s) return L.items.length ? 'no selection' : '';
      for (const q of [s.anchor, s.head]) {
        const it = L.byId.get(q.id);
        if (!it) return `no item ${q.id}`;
        if (!Number.isInteger(q.off) || q.off < 0) return `off ${q.off}`;
        if (it.kind === 'box') { if (q.off > 1) return 'box off'; continue; }
        const text = it.block.text;
        if (q.off > text.length) return `off ${q.off} > ${text.length}`;
        if (q.off === text.length || q.off === 0) continue;
        let inside = true;
        for (const g of seg.segment(text.slice(Math.max(0, q.off - 64), q.off + 64))) {
          if (g.index + Math.max(0, q.off - 64) === q.off) { inside = false; break; }
        }
        if (inside) return `${q.off} inside a cluster`;
      }
      for (const it of L.items) {
        if (!Number.isFinite(it.y) || !Number.isFinite(it.h) || it.h < 0 || it.h > 5e5) return `item ${it.id} y ${it.y} h ${it.h}`;
      }
      // the bands: one per section end but the last, none else
      const n = L.items.filter((it) => it.marks.some((m) => m.kind === 'section')).length;
      if (n !== d.d.doc.sections.length - 1) return `${n} bands for ${d.d.doc.sections.length} sections`;
      return '';
    };
    window.__menu = (d, ...names) => {
      let m = d.win.menu({}), it;
      for (const n of names) { it = m.items.find((i) => i.text === n); if (!it) return null; m = it.submenu ? it.submenu() : null; }
      return it;
    };
  }, files);

  // ---------------------------------------------------- 50,000 paragraphs
  {
    await ev(async () => { await window.__open('Huge'); });
    const res = {};
    for (const [label, how] of [['Ctrl-Enter', 'pageBreak'], ['Next page', 'sectionNext'], ['Page break before', 'flag']]) {
      await ev(() => { const d = window.__d(); window.__opened = window.__json(d); window.__real.view.focus(); });
      await page.keyboard.press('Control+a');
      await settle();
      const t0 = Date.now();
      if (how === 'pageBreak') await page.keyboard.press('Control+Enter');
      else await ev(([how]) => { const v = window.__d().view; if (how === 'flag') v.format('paraBox', { pageBreakBefore: true }); else window.__run(window.__d(), how); }, [how]);
      await settle();
      const dt = Date.now() - t0;
      const mid = await ev(() => { const d = window.__d(); return { n: d.view.layout.items.length, secs: window.__secs(d), bad: window.__bad(d), depth: d.view.undoDepth,
        flagged: d.d.doc.sections.flatMap((s) => s.blocks).filter((b) => b.pPr && b.pPr.pageBreakBefore).length }; });
      const t1 = Date.now();
      await page.keyboard.press('Control+z');
      await settle();
      const un = Date.now() - t1;
      const back = await ev(() => { const d = window.__d(); return { same: window.__json(d) === window.__opened, bad: window.__bad(d) }; });
      res[label] = { dt, un, mid, back };
      timings.push(`50,000 paragraphs, select all + ${label}: ${dt} ms, undo ${un} ms`);
    }
    // the flag on all of them: 50,000 gaps; painting after a scroll to the end
    const t3 = Date.now();
    await ev(async () => { const d = window.__d(); window.__real.view.focus(); d.view.setSelection({ id: d.view.layout.items[0].id, off: 0 }, { id: d.view.layout.items.at(-1).id, off: 1 });
      d.view.format('paraBox', { pageBreakBefore: true }); d.view.flush(); d.win.scrollTo(0, d.win.extent.y1 - 400); d.win.invalidate(); await window.__frames(3); });
    const paint = Date.now() - t3;
    const fin = await ev(() => { const d = window.__d(), L = d.view.layout; const res = { gaps: L.items.every((i) => i.gapAbove === 12), bad: window.__bad(d), msgs: window.__msgs.length };
      window.__undoAll(d); res.back = window.__json(d) === window.__opened; window.__real.close(); return res; });
    timings.push(`50,000 flagged paragraphs: flag + scroll + paint ${paint} ms`);
    ok('50,000 paragraphs: select all + Ctrl-Enter, + Next page, + the Page break before flag each under 5 s and one undo step, undo under 5 s '
      + 'restores the opened model; the flag on all 50,000 (a 12 px gap each) and a paint at the end under 6 s; no errors',
    Object.values(res).every((x) => x.dt < 5000 && x.un < 5000 && x.mid.depth === 1 && !x.mid.bad && x.back.same && !x.back.bad)
      && res['Page break before'].mid.flagged === 50000 && res['Ctrl-Enter'].mid.n === 2 && res['Next page'].mid.secs === 2
      && fin.gaps && fin.back && !fin.bad && !fin.msgs && paint < 6000, { res, fin, paint });
  }

  // ---------------------------------------------------- 1000 Ctrl-Enter
  {
    await ev(async () => { const d = await window.__open('Spam'); window.__opened = window.__json(d); window.__at(d, 0, 5); });
    const t0 = Date.now();
    for (let k = 0; k < 100; k++) await page.keyboard.press('Control+Enter');
    await settle();
    const real = Date.now() - t0;
    const tg = await ev(async () => {
      const d = window.__d(), v = d.view;
      let worst = 0;
      for (let k = 0; k < 900; k++) {
        const t = performance.now();
        window.__run(d, 'pageBreak');
        worst = Math.max(worst, performance.now() - t);
      }
      v.flush();
      await window.__frames(2);
      const res = { worst, n: v.layout.items.length, bad: window.__bad(d), json: window.__json(d), depth: v.undoDepth, msgs: window.__msgs.length,
        breaks: d.d.doc.sections.flatMap((s) => s.blocks).filter((b) => Object.values(b.inlines).some((x) => x.kind === 'br' && x.brType === 'page')).length };
      const t1 = performance.now();
      res.undone = window.__undoAll(d);
      res.undoMs = performance.now() - t1;
      res.back = window.__json(d) === window.__opened;
      window.__real.close();
      return res;
    });
    timings.push(`1000 Ctrl-Enter: 100 real keys ${real} ms, worst command ${Math.round(tg.worst)} ms, undo all ${Math.round(tg.undoMs)} ms`);
    ok('1000 Ctrl-Enter (100 real keys, 900 commands): 1000 breaks in 1001 paragraphs, model and selection valid, each command under 250 ms, '
      + 'one undo step each; undoing everything under 8 s gives back the opened model', tg.breaks === 1000 && tg.n === 1001 && tg.depth === 1000
      && !tg.bad && !modelBad(tg.json) && tg.worst < 250 && tg.undoMs < 8000 && tg.back && !tg.msgs, { ...tg, json: undefined });
  }

  // ---------------------------------------------------- 1000 sections
  {
    await ev(async () => { const d = await window.__open('Secs'); window.__opened = window.__json(d); window.__atEnd(d, 0); });
    const tg = await ev(async () => {
      const d = window.__d(), v = d.view;
      let worst = 0;
      for (let k = 0; k < 1000; k++) {
        const t = performance.now();
        if (k % 20 === 0) window.__menu(d, 'Insert', 'Section break', k % 40 === 0 ? 'Next page' : 'Continuous').action();
        else window.__run(d, k % 2 ? 'sectionNext' : 'sectionContinuous');
        worst = Math.max(worst, performance.now() - t);
      }
      v.flush();
      await window.__frames(2);
      const res = { worst, secs: window.__secs(d), n: v.layout.items.length, bad: window.__bad(d), json: window.__json(d), depth: v.undoDepth, msgs: window.__msgs.length };
      const t1 = performance.now();
      d.win.scrollTo(0, d.win.extent.y1 - 400);
      d.win.invalidate();
      await window.__frames(3);
      res.paintMs = performance.now() - t1;
      const t2 = performance.now();
      res.undone = window.__undoAll(d);
      res.undoMs = performance.now() - t2;
      res.back = window.__json(d) === window.__opened;
      window.__real.close();
      return res;
    });
    timings.push(`1000 section breaks: worst command ${Math.round(tg.worst)} ms, paint at the end ${Math.round(tg.paintMs)} ms, undo all ${Math.round(tg.undoMs)} ms`);
    ok('1000 section breaks (50 from the Insert menu): 1001 sections, a band under each section but the last, model and selection valid, each command under 250 ms, '
      + 'one undo step each; painting at the end under 3 s; undoing everything under 8 s gives back the opened model', tg.secs === 1001 && tg.depth === 1000
      && !tg.bad && !modelBad(tg.json) && tg.worst < 250 && tg.paintMs < 3000 && tg.undoMs < 8000 && tg.back && !tg.msgs, { ...tg, json: undefined });
  }

  // ---------------------------------------------------- delete storms at section edges
  {
    await ev(async () => { const d = await window.__open('Storm'); window.__opened = window.__json(d); });
    const rnd = rng(77), bad = [];
    const t0 = Date.now();
    let removed = 0, none = 0;
    for (let k = 0; k < 150; k++) {
      // real keys: at a random paragraph's start Backspace, at its end Delete
      const i = Math.floor(rnd() * (await ev(() => window.__d().view.layout.items.length))), atEnd = rnd() < 0.5;
      const before = await ev(([i, atEnd]) => { const d = window.__d(); if (atEnd) window.__atEnd(d, i); else window.__at(d, i, 0); return window.__secs(d); }, [i, atEnd]);
      await page.keyboard.press(atEnd ? 'Delete' : 'Backspace');
      await settle();
      const s = await ev((k) => { const d = window.__d(); return { secs: window.__secs(d), why: window.__bad(d) + (window.__msgs.length ? ' msgs' : ''), json: k % 25 === 0 ? window.__json(d) : '[]' }; }, k);
      if (s.secs < before) removed++; else none++;
      const mb = modelBad(s.json);
      if ((s.why || mb) && bad.length < 5) bad.push(`${k}: ${s.why} ${mb}`);
    }
    const storm = await ev(async () => {
      const d = window.__d(), v = d.view;
      const ids = ['delete', 'backspace', 'ctrlDelete', 'ctrlBackspace'];
      let n = 0, worst = 0, seed = 12345;
      const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      for (let k = 0; k < 450; k++) {
        const L = v.layout, i = Math.floor(rnd() * L.items.length);
        if (rnd() < 0.5) window.__atEnd(d, i); else window.__at(d, i, 0);
        const t = performance.now();
        window.__run(d, ids[k % 4]);
        worst = Math.max(worst, performance.now() - t);
        n++;
      }
      v.flush();
      await window.__frames(2);
      const res = { n, worst, secs: window.__secs(d), bad: window.__bad(d), json: window.__json(d), msgs: window.__msgs.length };
      const t1 = performance.now();
      res.undone = window.__undoAll(d);
      res.undoMs = performance.now() - t1;
      res.back = window.__json(d) === window.__opened;
      window.__real.close();
      return res;
    });
    timings.push(`delete storms: 150 real keys ${Date.now() - t0} ms (${removed} merged sections, ${none} not), worst command ${Math.round(storm.worst)} ms`);
    ok('delete storms over 500 sections: 150 real Backspace / Delete presses and 450 commands (Delete, Backspace and the Ctrl forms) at random edges: sections only merge, '
      + 'the model, selection and bands stay valid after each, each command under 250 ms; undoing everything under 8 s gives back the opened model',
    !bad.length && removed > 20 && storm.secs < 501 && !storm.bad && !modelBad(storm.json) && storm.worst < 250 && storm.undoMs < 8000 && storm.back && !storm.msgs,
    { bad, removed, none, storm: { ...storm, json: undefined } });
  }

  // ---------------------------------------------------- select all + Backspace over 500 sections
  {
    await ev(async () => { const d = await window.__open('All'); window.__opened = window.__json(d); window.__real.view.focus(); });
    await page.keyboard.press('Control+a');
    await settle();
    const t0 = Date.now();
    await page.keyboard.press('Backspace');
    await settle();
    const dt = Date.now() - t0;
    const mid = await ev(() => { const d = window.__d(); return { secs: window.__secs(d), n: d.view.layout.items.length, bad: window.__bad(d), json: window.__json(d), depth: d.view.undoDepth }; });
    const t1 = Date.now();
    await page.keyboard.press('Control+z');
    await settle();
    const un = Date.now() - t1;
    const end = await ev(() => { const d = window.__d(); const res = { same: window.__json(d) === window.__opened, bad: window.__bad(d), msgs: window.__msgs.length }; window.__real.close(); return res; });
    timings.push(`select all + Backspace over 500 sections: ${dt} ms, undo ${un} ms`);
    ok('select all + Backspace over 500 sections: under 5 s, one undo step, every section is kept (a range deleted across a break keeps the sections), '
      + 'model valid; Ctrl-Z under 5 s gives back the opened model', dt < 5000 && un < 5000 && mid.depth === 1 && mid.secs === 501 && !mid.bad && !modelBad(mid.json)
      && end.same && !end.bad && !end.msgs, { dt, un, mid: { ...mid, json: undefined }, end });
  }

  // ---------------------------------------------------- 500 random actions
  {
    const box = await ev(async () => {
      const d = await window.__open('Mixed', { h: 420 }), w = d.win;
      window.__opened = window.__json(d);
      const a = window.__client(w, w.scrollX, w.scrollY), b = window.__client(w, w.scrollX + w.w, w.scrollY + w.h);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y, top: d.view.layout.top };
    });
    const rnd = rng(20261010), pick1 = (a) => a[Math.floor(rnd() * a.length)];
    const KEYS = ['Control+Enter', 'Control+Enter', 'Control+z', 'Control+y', 'Backspace', 'Backspace', 'Delete', 'Delete', 'Enter', 'Home', 'End', 'ArrowUp', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'Shift+ArrowDown', 'Shift+End', 'Control+a', 'Control+Backspace', 'Control+Delete', 'Escape', 'Tab', 'Control+k', 'Control+Shift+F5'];
    const TEXT = ['a', ' ', 'word ', 'é', '\u{1F600}'];
    const IDS = [['pageBreak'], ['sectionNext'], ['sectionContinuous'], ['sectionBogus'], ['paraBox', { pageBreakBefore: true }], ['paraBox', { pageBreakBefore: false }],
      ['paraBox', { keepNext: true }], ['paraBox', { bad: 1 }]];
    const MENU = [['Insert', 'Page break'], ['Insert', 'Section break', 'Next page'], ['Insert', 'Section break', 'Continuous'], ['Insert', 'Symbol...'],
      ['Insert', 'Special character'], ['Insert', 'Hyperlink...'], ['Insert', 'Bookmark...']];
    const at = () => ({ x: box.x0 + 2 + rnd() * (box.x1 - box.x0 - 4), y: box.y0 + box.top + 2 + rnd() * (box.y1 - box.y0 - box.top - 4) });
    const kinds = {};
    const bad = [];
    for (let k = 0; k < 500; k++) {
      const a = rnd();
      let what;
      if (a < 0.45) {
        what = pick1(KEYS);
        await page.keyboard.press(what);
      } else if (a < 0.55) {
        what = 'text';
        await page.keyboard.insertText(pick1(TEXT));
      } else if (a < 0.7) {
        const q = at();
        what = 'mouse';
        if (rnd() < 0.6) await page.mouse.click(q.x, q.y);
        else {
          const e = at();
          await page.mouse.move(q.x, q.y); await page.mouse.down();
          await page.mouse.move(e.x, e.y, { steps: 3 });
          await page.mouse.up();
        }
      } else if (a < 0.85) {
        const [id, arg] = pick1(IDS);
        what = 'id ' + id;
        await ev(([id, arg]) => { try { const v = window.__d().view; if (id === 'paraBox') v.format(id, arg); else window.__run(window.__d(), id); } catch (e) { if (!(e instanceof RangeError) && !/bad|refus|invalid/i.test(e.message)) window.__msgs.push('threw ' + e.message); } }, [id, arg]);
      } else {
        what = 'menu ' + pick1(MENU).join('>');
        const path = what.slice(5).split('>');
        await ev((path) => { const it = window.__menu(window.__d(), ...path); if (!it) window.__msgs.push('no menu item ' + path); else if (!(typeof it.shaded === 'function' ? it.shaded() : it.shaded) && it.action) it.action(); }, path);
      }
      const kind = what.split(' ')[0].replace(/^[A-Z].*/, 'key');
      kinds[kind] = (kinds[kind] || 0) + 1;
      const s = await ev(async () => {
        await window.__frames(1);
        const d = window.__d();
        if (!d || !window.__doc(window.__cur)) return { why: 'window gone', json: '[]' };
        const why = window.__bad(d) + (window.__msgs.length ? ' msgs ' + window.__msgs.slice(-1) : '');
        if (os.wimp.menus.isOpen) os.wimp.menus.close();
        return { why, json: window.__json(d) };
      });
      const mb = modelBad(s.json);
      if ((s.why || mb) && bad.length < 5) bad.push(`${k} (${what}): ${s.why} ${mb}`);
      if (s.why === 'window gone') break;
    }
    const end = await ev(() => {
      const d = window.__d();
      const secs = window.__secs(d);
      const n = window.__undoAll(d);
      const res = { n, secs, same: window.__json(d) === window.__opened, dirty: d.view.dirty, bad: window.__bad(d), errs: window.__msgs.length };
      window.__real.close();
      return res;
    });
    ok('500 random keys (Ctrl-Enter, Backspace, Delete among them), text, clicks and drags, the break ids, the Page break before flag and the Insert menu\'s items '
      + '(the later ones shaded): selection, every block and the bands valid after each, no errors; undoing everything gives back the opened model',
    !bad.length && end.same && !end.dirty && !end.bad && !end.errs && !pageErrors() && Object.keys(kinds).length >= 4, { bad, end, kinds });
    timings.push('random actions: ' + JSON.stringify(kinds));
  }
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log('timings: ' + timings.join('; '));
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
