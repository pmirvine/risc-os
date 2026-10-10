// !Word's paragraph spacing against hostile input in the real
// desktop: a 50,000-paragraph document opens, takes select all +
// Ctrl-2 and its undo, and paints, within generous bounds (times
// logged); 1000 Ctrl-2 / Ctrl-1 toggles (100 real key presses and
// 900 by the command) leave one paragraph's model valid and undo
// whole; documents with absurd values (a line of 999999 exact, a
// negative line, junk numbers, autospacing, a before of millions of
// twips) open with every line height finite and within the drawable
// range, take every spacing key at every paragraph, and undo gives
// back the opened model; a Paragraph dialogue box open while its
// window closes (the box goes with the document, nothing left
// behind); and 500 seeded random actions (keys incl. Ctrl-1/2/5/0,
// text, clicks and drags, the line spacing, space and flow ids, the
// Paragraph box's OK) with the selection and every block valid after
// each, and undo of everything giving back the opened model. No page
// errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { rng } from './word-docs.mjs';
import { checkBlock } from '../../tools/moreapps/!Word/ModelCheck';

const docx = async (body) => Array.from(await buildDocx({ 'word/document.xml': documentXml(body) }));
const SP = (a) => `<w:spacing ${a}/>`;
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const LONG = 'Spacing moves lines apart, and a paragraph with many words wraps onto several lines in the window. '.repeat(3);
const ABSURD = [
  p(r('line 999999 exact ' + LONG), SP('w:line="999999" w:lineRule="exact" w:before="9999999" w:after="9999999"')),
  p(r('negative line ' + LONG), SP('w:line="-240" w:lineRule="atLeast" w:after="-5"')),
  p(r('junk numbers'), SP('w:line="x" w:lineRule="zz" w:before="" w:after="1e9"')),
  p(r('auto line 99999 ' + LONG), SP('w:line="99999" w:lineRule="auto"')),
  p(r('auto line 0'), SP('w:line="0" w:lineRule="auto"')),
  p(r('exact 0'), SP('w:line="0" w:lineRule="exact"')),
  p(r('autospacing'), SP('w:beforeAutospacing="1" w:afterAutospacing="1" w:line="480" w:lineRule="auto"')),
  p(r('lines units'), SP('w:beforeLines="100000" w:afterLines="-3"')),
  p(r('flow'), '<w:keepNext/><w:keepLines/><w:widowControl w:val="0"/><w:pageBreakBefore/><w:contextualSpacing/>'),
  p(r('plain')),
].join('');
const MIXED = [p(r('Heading one'), '<w:spacing w:before="480" w:after="120"/>'),
  ...Array.from({ length: 12 }, (_, i) => p(r(`Paragraph ${i} ` + LONG.slice(0, 40 + i * 20)),
    i % 3 === 0 ? SP('w:line="360" w:lineRule="auto"') : i % 3 === 1 ? SP('w:line="300" w:lineRule="exact"') : '')),
  p(r('The end.'))].join('');
const HUGE = Array.from({ length: 50000 }, (_, i) => p(r(`${i} ${WORDS[i % 10]} words`),
  i % 5 === 0 ? SP('w:before="120" w:after="60"') : '')).join('');
const files = { Huge: await docx(HUGE), Absurd: await docx(ABSURD), Mixed: await docx(MIXED), Toggle: await docx(MIXED), Close: await docx(MIXED) };

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
      // every item has a finite, positive height and a finite y (the spacing must never poison the layout)
      for (const it of L.items) {
        if (!Number.isFinite(it.y) || !Number.isFinite(it.h) || it.h < 0 || it.h > 5e5) return `item ${it.id} y ${it.y} h ${it.h}`;
      }
      return '';
    };
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
  }, files);

  const winMenu = async () => {
    const ic = await ev(() => { const rc = window.__d().toolbar2.icon('lineSpacing').el.getBoundingClientRect(); return { x: rc.left + 4, y: rc.top + 4 }; });
    await page.mouse.click(ic.x, ic.y, { button: 'middle' });
    await wait(200);
  };
  const pick = async (level, text, hover) => {
    const item = page.locator('.menu').nth(level).locator('.mitem', { hasText: new RegExp('^' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
    const b = await item.boundingBox();
    if (!b) throw new Error(`no menu item '${text}' at level ${level}`);
    if (hover) {
      await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 2 });
      await page.mouse.move(b.x + b.width - 6, b.y + b.height / 2, { steps: 3 });
      await wait(250);
    } else {
      await page.mouse.click(b.x + 30, b.y + b.height / 2);
      await wait(150);
    }
    await settle();
  };
  const openBox = async () => { await winMenu(); await pick(0, 'Format', true); await pick(1, 'Paragraph...'); await wait(100); await settle(); };
  const counts = () => ev(() => {
    const t = window.__word(), n = (e) => [...e._h.values()].reduce((a, l) => a + l.length, 0);
    return { win: os.wimp.windows.size, task: t.windows.size, icons: document.querySelectorAll('.icon').length, wl: n(os.wimp), tl: n(t), menus: os.wimp.menus.isOpen };
  });

  // ---------------------------------------------------- 50,000 paragraphs
  {
    await ev(async () => { await window.__open('Huge'); });
    const t0 = Date.now();
    await ev(() => { const d = window.__d(); window.__opened = window.__json(d); window.__real.view.focus(); });
    await page.keyboard.press('Control+a');
    await settle();
    const t1 = Date.now();
    await page.keyboard.press('Control+2');
    await settle();
    const dbl = Date.now() - t1;
    const mid = await ev(() => {
      const d = window.__d();
      const sp = d.d.doc.sections.flatMap((s) => s.blocks)[777].pPr.spacing;
      return { line: sp && sp.line, rule: sp && sp.lineRule, bad: window.__bad(d), n: d.view.layout.items.length, depth: d.view.undoDepth };
    });
    const t2 = Date.now();
    await page.keyboard.press('Control+z');
    await settle();
    const undo = Date.now() - t2;
    const t3 = Date.now();
    await ev(async () => { const d = window.__d(); d.win.scrollTo(0, d.win.extent.y1 - 400); d.win.invalidate(); await window.__frames(2); });
    const paint = Date.now() - t3;
    const end = await ev(() => { const d = window.__d(); const res = { back: window.__json(d) === window.__opened, bad: window.__bad(d), msgs: window.__msgs.length }; window.__real.close(); return res; });
    timings.push(`50,000 paragraphs: select all + Ctrl-2 ${dbl} ms, undo ${undo} ms, paint after scroll ${paint} ms (total ${Date.now() - t0})`);
    ok('50,000 paragraphs: select all + Ctrl-2 under 8 s (one undo step, line 480), Ctrl-Z under 8 s restores the opened model, '
      + 'painting after a scroll to the end under 3 s, layout finite, no errors',
    mid.n === 50000 && mid.line === 480 && mid.depth === 1 && mid.bad === '' && dbl < 8000 && undo < 8000 && paint < 3000
      && end.back && !end.bad && !end.msgs, { mid, end, dbl, undo, paint });
  }

  // ---------------------------------------------------- 1000 toggles
  {
    await ev(async () => { const d = await window.__open('Toggle'); window.__opened = window.__json(d); window.__at(d, 2, 3); });
    const t0 = Date.now();
    for (let k = 0; k < 50; k++) { await page.keyboard.press('Control+2'); await page.keyboard.press('Control+1'); }
    await settle();
    const real = Date.now() - t0;
    const tg = await ev(async () => {
      const d = window.__d(), v = d.view;
      let worst = 0;
      for (let k = 0; k < 450; k++) {
        const t = performance.now();
        v.format('lineDouble');
        v.format('lineSingle');
        worst = Math.max(worst, performance.now() - t);
        if (k % 90 === 0) window.__at(d, 1 + (k % 10), 0);
      }
      v.flush();
      await window.__frames(2);
      const sel = v.selection.head.id, sp = d.d.doc.sections[0].blocks.find((b) => b.id === sel).pPr.spacing;
      const res = { worst, line: v.query().lineSpacing && v.query().lineSpacing.line, bad: window.__bad(d), json: window.__json(d), depth: v.undoDepth, msgs: window.__msgs.length };
      res.undone = window.__undoAll(d);
      res.back = window.__json(d) === window.__opened;
      window.__real.close();
      return res;
    });
    timings.push(`1000 Ctrl-2 / Ctrl-1 toggles: 100 real keys ${real} ms, worst command pair ${Math.round(tg.worst)} ms`);
    ok('1000 Ctrl-2 / Ctrl-1 toggles (100 real keys, 900 commands) on carets: single line at the end, model and selection valid, '
      + 'each command pair under 250 ms; undoing everything gives back the opened model', tg.line === 240 && tg.depth === 1000 && !tg.bad && !modelBad(tg.json)
      && tg.worst < 250 && tg.back && !tg.msgs, { ...tg, json: undefined });
  }

  // ---------------------------------------------------- absurd values in files
  {
    const ab = await ev(async () => {
      const t0 = performance.now();
      const d = await window.__open('Absurd');
      const opened = performance.now() - t0;
      const v = d.view, opened0 = window.__json(d), res = { opened, steps: [], heights: v.layout.items.map((it) => it.h) };
      for (let i = 0; i < v.layout.items.length; i++) {
        for (const id of ['lineSingle', 'lineDouble', 'line15', 'spaceBefore12', 'spaceBefore12', 'lineSpacing']) {
          window.__at(d, i, 0);
          try { v.format(id, id === 'lineSpacing' ? 2.5 : undefined); } catch (e) { res.steps.push(`${i} ${id}: ${e.message}`); }
          const why = window.__bad(d);
          if (why) res.steps.push(`${i} ${id}: ${why}`);
        }
      }
      // everything selected, then each key
      window.__at(d, 0, 0);
      v.setSelection({ id: v.layout.items[0].id, off: 0 }, { id: v.layout.items.at(-1).id, off: 1 });
      for (const id of ['lineDouble', 'lineSingle', 'spaceBefore12']) { try { v.format(id); } catch (e) { res.steps.push(`all ${id}: ${e.message}`); } }
      v.flush();
      await window.__frames(2);
      Object.assign(res, { bad: window.__bad(d), json: window.__json(d), msgs: window.__msgs.slice() });
      window.__undoAll(d);
      res.back = window.__json(d) === opened0;
      window.__real.close();
      return res;
    });
    timings.push(`absurd spacing opened in ${Math.round(ab.opened)} ms`);
    ok('absurd spacing (line 999999 exact, negative, junk, autospacing, before of millions): opens in under 3 s with every item height '
      + 'finite and within 500000 px; every spacing key at every paragraph and on everything: no exception, selection and model valid; '
      + 'undoing everything gives back the opened model', ab.opened < 3000 && ab.heights.every((h) => Number.isFinite(h) && h >= 0 && h < 5e5)
      && !ab.steps.length && !ab.bad && !modelBad(ab.json) && ab.back && !ab.msgs.length && !pageErrors(), { ...ab, json: undefined, model: modelBad(ab.json) });
  }

  // ---------------------------------------------------- Paragraph box open while its window closes
  {
    const pre = await counts();
    let leaks = [];
    for (let k = 0; k < 5; k++) {
      await ev(async () => { const d = await window.__open('Close'); window.__at(d, 2, 3); });
      const c0 = await counts();
      await openBox();
      const opened = await ev(() => { const d = window.__d(); return d.dw.boxes.has('para'); });
      // type into a field, leave the box open, close the document (Discard of nothing: the document is clean)
      const closed = await ev(async () => {
        const d = window.__d(), api = window.__word().word.dialog({ key: 'para:' + d.docKey, rows: [] });
        const res = { had: !!api };
        window.__real.close();
        await window.__frames(3);
        res.docs = window.__word().word.docs.filter((x) => x.path.endsWith('.Close')).length;
        res.msgs = window.__msgs.length;
        return res;
      });
      const c1 = await counts();
      if (!opened || closed.docs || closed.msgs || c1.win > pre.win || c1.icons > pre.icons || c1.wl > pre.wl || c1.tl > pre.tl) leaks.push({ k, opened, closed, c0, c1 });
    }
    const post = await counts();
    ok('the Paragraph box open while its window closes (5 times): the box goes with the document; no windows, '
      + 'icons, listeners or menus left; no errors', !leaks.length && post.win <= pre.win && post.icons <= pre.icons && post.wl <= pre.wl
      && post.tl <= pre.tl && !post.menus && !pageErrors(), { leaks, pre, post });
  }

  // ---------------------------------------------------- 500 random actions
  {
    const box = await ev(async () => {
      const d = await window.__open('Mixed', { h: 420 }), w = d.win;
      window.__opened = window.__json(d);
      const a = window.__client(w, w.scrollX, w.scrollY), b = window.__client(w, w.scrollX + w.w, w.scrollY + w.h);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y, top: d.view.layout.top };
    });
    const rnd = rng(20261009), pick1 = (a) => a[Math.floor(rnd() * a.length)];
    const KEYS = ['Control+1', 'Control+2', 'Control+5', 'Control+0', 'Control+1', 'Control+2', 'Control+z', 'Control+y', 'Backspace', 'Enter', 'Delete',
      'Home', 'End', 'ArrowUp', 'ArrowDown', 'Shift+ArrowDown', 'Shift+End', 'Control+a', 'Control+b', 'Escape', 'Tab'];
    const TEXT = ['a', ' ', 'word ', 'é', '\u{1F600}'];
    const IDS = [['lineSingle'], ['lineDouble'], ['line15'], ['spaceBefore12'], ['lineSpacing', 1.15], ['lineSpacing', 3], ['lineSpacing', { line: 1e9, lineRule: 'exact' }],
      ['spaceBefore', 240], ['spaceBefore', null], ['spaceAfter', 200], ['spaceAfter', 'x'],
      ['paraBox', { keepNext: true }], ['paraBox', { keepNext: false, widowControl: false }], ['paraBox', { pageBreakBefore: true }],
      ['paraBox', { contextualSpacing: true }], ['paraBox', { spacing: { before: 120, after: 240, line: 276, lineRule: 'auto' } }],
      ['paraBox', { spacing: { line: 400, lineRule: 'exact' } }], ['paraBox', { jc: 'center', ind: { left: 720, hanging: 360 } }], ['paraBox', { bad: 1 }]];
    const at = () => ({ x: box.x0 + 2 + rnd() * (box.x1 - box.x0 - 4), y: box.y0 + box.top + 2 + rnd() * (box.y1 - box.y0 - box.top - 4) });
    const kinds = {};
    const bad = [];
    for (let k = 0; k < 500; k++) {
      const a = rnd();
      let what;
      if (a < 0.4) {
        what = pick1(KEYS);
        await page.keyboard.press(what);
      } else if (a < 0.5) {
        what = 'text';
        await page.keyboard.insertText(pick1(TEXT));
      } else if (a < 0.65) {
        const q = at();
        what = 'mouse';
        if (rnd() < 0.6) await page.mouse.click(q.x, q.y);
        else {
          const e = at();
          await page.mouse.move(q.x, q.y); await page.mouse.down();
          await page.mouse.move(e.x, e.y, { steps: 3 });
          await page.mouse.up();
        }
      } else if (a < 0.93) {
        const [id, arg] = pick1(IDS);
        what = 'format ' + id;
        await ev(([id, arg]) => { try { window.__d().view.format(id, arg); } catch (e) { if (!(e instanceof RangeError) && !/bad|refus|invalid/i.test(e.message)) window.__msgs.push('threw ' + e.message); } }, [id, arg]);
      } else {
        // the real Paragraph box: open it, OK (maybe after a toggled option)
        what = 'box';
        await openBox();
        if (rnd() < 0.5) {
          await ev(() => { const d = window.__d(), api = window.__word().word.dialog({ key: 'para:' + d.docKey, rows: [] }); api.set('keepnext', !api.get('keepnext')); });
        }
        await page.keyboard.press(rnd() < 0.7 ? 'Enter' : 'Escape');
        await settle();
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
      const boxOpen = d.dw.boxes.has('para') && window.__word().word.dialog({ key: 'para:' + d.docKey, rows: [] }).isOpen;
      const n = window.__undoAll(d);
      const res = { n, same: window.__json(d) === window.__opened, dirty: d.view.dirty, bad: window.__bad(d), errs: window.__msgs.length, boxOpen };
      window.__real.close();
      return res;
    });
    ok('500 random keys (Ctrl-1/2/5/0 among them), text, clicks and drags, the spacing, flow and Paragraph-box ids, and the real box: '
      + 'selection and every block valid after each, no errors; undoing everything gives back the opened model',
    !bad.length && end.same && !end.dirty && !end.bad && !end.errs && !pageErrors() && Object.keys(kinds).length >= 5, { bad, end, kinds });
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
