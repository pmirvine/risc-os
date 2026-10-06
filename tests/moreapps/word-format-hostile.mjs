// !Word's formatting against hostile input in the real desktop:
// everything selected in a 50,000-paragraph document then Ctrl-B,
// Ctrl-E, a size (Ctrl-Shift->) and undo, each under 5 s and one undo
// step; 1000 Ctrl-B in a row (on a selection and at a caret: no
// freeze, the history within its cap); toolbar clicks while an input
// method composes (through CDP: the composition goes on or is
// cancelled cleanly, and its commit types the right text where the
// caret was); each popup of the toolbar open while the window closes;
// absurd sizes typed into the size field ('999999' clamped to 400;
// the field types digits and a point only, so '-5' gives 5 and '1e3'
// 13, while 'NaN' and '' leave it empty: refused, nothing changed);
// zoom changes while the window
// is resized (the extent, the ruler and the caret follow); and 500
// seeded random actions: keys (formatting keys among them), text,
// mouse clicks and drags, toolbar clicks and their popups, Format
// menu choices, zoom changes and ruler drags (after each: the
// selection valid, every block passes ModelCheck.checkBlock, no error;
// undoing everything gives back the opened model). No page errors.
// Positions come from the layout the test hook gives
// (task.word.docs[i].view, ./EditView hook()).
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { rng } from './word-docs.mjs';
import { checkBlock } from '../../tools/moreapps/!Word/ModelCheck';

const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const docx = (body) => buildDocx({ 'word/document.xml': documentXml(body) });
const H1 = '<w:pStyle w:val="Heading1"/>';
const files = {
  Plain: Array.from(await docx(Array.from({ length: 30 }, (_, i) => p(r(`${i}: ` + WORDS.slice(0, 3 + (i % 5)).join(' ')))).join(''))),
  Huge: Array.from(await docx(Array.from({ length: 50000 }, (_, i) => p(r(`${i} ${WORDS[i % 10]}`))).join(''))),
  Mixed: Array.from(await docx(p(r('A heading'), H1) + p(r('Plain ') + r('bold', '<w:b/>') + r(' and ') +
    r('big', '<w:sz w:val="40"/>') + r(' text.')) + '<w:p><w:r><w:t xml:space="preserve">A </w:t></w:r><w:hyperlink w:anchor="x">' +
    '<w:r><w:t>link</w:t></w:r></w:hyperlink><w:r><w:t xml:space="preserve"> after it.</w:t></w:r></w:p>' +
    p(r('Indented paragraph with a hanging indent.'), '<w:ind w:left="1440" w:hanging="720"/>') +
    '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc>' + p(r('a cell')) + '</w:tc></w:tr></w:tbl>' +
    Array.from({ length: 24 }, (_, i) => p(r(`Line ${i} ` + WORDS.join(' ')))).join(''))),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const timings = [];
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => ev(() => window.__frames(2));
const pageErrors = () => logs.filter((l) => /PAGEERROR/.test(l)).length;
/** Every block of a JSON model passes checkBlock: '' or the error. */
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
    window.__client = (w, x, y) => {
      const s = w.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + s.x * k, y: rc.top + s.y * k };
    };
    /** Open leaf in Word, its window at a known place, the caret in it; the hook (window.__dw). */
    window.__open = async (leaf, at = {}) => {
      if (!window.__word()) await os.filer.run(`RAM::RamDisc0.$.${leaf}`);
      for (let i = 0; i < 200 && !window.__word(); i++) await window.__sleep(50);
      const real = await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      real.win.open({ x: 100, y: 60, w: 860, h: 480, ...at, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      real.view.focus();
      window.__real = real;
      window.__dw = window.__hook();
      return window.__dw;
    };
    /** The test hook of the open window (fresh: its doc is a snapshot). */
    window.__hook = () => {
      const dw = window.__word().word.docs.find((d) => d.win === window.__real.win);
      if (dw) dw.close = () => window.__real.close();
      return dw;
    };
    window.__icon = (name) => {
      const ic = window.__hook().toolbar.icon(name), rc = ic.el.getBoundingClientRect();
      return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
    };
    window.__key = (w, code, key, extra = {}) => w.emit('key', { code, key, shift: false, ctrl: false, ...extra });
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    /** '' if the selection of dw is valid, else what is wrong. */
    window.__bad = (dw) => {
      const L = dw.view.layout, s = dw.view.selection;
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
      return '';
    };
    window.__json = (dw) => JSON.stringify(dw.d.doc.sections);
    window.__undoAll = (dw) => { let n = 0; while (dw.d.canUndo && n < 5000) { dw.view.press('undo'); n++; } dw.view.flush(); return n; };
    window.__runs = (dw, i) => {
      const b = dw.d.doc.sections[0].blocks[i];
      return b.runs.map((x) => { const o = { ...x.rPr }; delete o.extra; return [b.text.slice(x.start, x.end), o]; });
    };
  }, files);

  // ---------------------------------------------------- 50,000 paragraphs: select all, Ctrl-B, Ctrl-E, size, undo
  {
    const o = await ev(async () => {
      const t0 = performance.now();
      const dw = await window.__open('Huge');
      return { open: Math.round(performance.now() - t0), n: dw.view.lines().length };
    });
    timings.push(`50,000 paragraphs opened in ${o.open} ms`);
    await page.keyboard.press('Control+a');
    const json0 = await ev(() => { window.__h0 = window.__json(window.__dw); return window.__h0.length; });
    const steps = [];
    for (const [what, key] of [['Ctrl-B', 'Control+b'], ['Ctrl-E', 'Control+e'], ['Ctrl-Shift->', 'Control+Shift+Period'],
      ['undo', 'Control+z'], ['undo', 'Control+z'], ['undo', 'Control+z']]) {
      const depth = await ev(() => window.__dw.view.undoDepth);
      const t0 = Date.now();
      await page.keyboard.press(key);
      const s = await ev(async () => {
        const dw = window.__dw;
        dw.view.flush();
        await window.__frames(1);
        const d = dw.d.doc.sections[0].blocks;
        const pick = [d[0], d[25000], d[49999]];
        return { depth: dw.view.undoDepth, b: pick.map((x) => x.runs[0].rPr.b === true), jc: pick.map((x) => x.pPr.jc ?? null),
          sz: pick.map((x) => x.runs[0].rPr.sz ?? null), bad: window.__bad(dw), msgs: window.__msgs.length };
      });
      steps.push({ what, ms: Date.now() - t0, step: s.depth - depth, ...s });
    }
    const back = await ev(() => window.__json(window.__dw) === window.__h0);
    timings.push('50,000 paragraphs: ' + steps.map((s) => `${s.what} ${s.ms} ms`).join(', '));
    const [b, e, z, u1, u2, u3] = steps;
    ok('50,000 paragraphs selected: Ctrl-B, Ctrl-E and Ctrl-Shift-> each one undo step under 5 s, applied to all',
      o.n === 50000 && json0 > 0 && [b, e, z].every((s) => s.step === 1 && s.ms < 5000 && !s.bad && !s.msgs)
      && b.b.every(Boolean) && e.jc.every((x) => x === 'center') && z.sz.every((x) => x === 24), steps);
    ok('... and three undos, each one step under 5 s, give back the opened model', [u1, u2, u3].every((s) => s.step === -1 && s.ms < 5000)
      && back && u3.b.every((x) => !x), { steps: steps.slice(3), back });
    await ev(() => window.__dw.close());
  }

  // ---------------------------------------------------- 1000 Ctrl-B in a row
  {
    const t = await ev(async () => {
      const dw = await window.__open('Plain'), w = dw.win, L = dw.view.layout;
      const before = window.__json(dw);
      dw.view.setSelection({ id: L.items[4].id, off: 0 }, { id: L.items[6].id, off: 5 });
      const t0 = performance.now();
      let worst = 0;
      const each = [];
      for (let k = 0; k < 1000; k++) {
        const t1 = performance.now();
        window.__key(w, 2, 'b', { ctrl: true });
        each.push(performance.now() - t1);
        worst = Math.max(worst, each[each.length - 1]);
      }
      await window.__frames(2);
      const ms = performance.now() - t0;
      each.sort((a, b) => a - b);
      const res = { ms: Math.round(ms), worst: Math.round(worst), p95: Math.round(each[949]), depth: dw.view.undoDepth, bad: window.__bad(dw), json: window.__json(dw),
        runs: window.__runs(dw, 5), msgs: window.__msgs.length };
      // at a caret: pending only, no step
      dw.view.setSelection({ id: L.items[2].id, off: 3 });
      const d0 = dw.view.undoDepth;
      for (let k = 0; k < 1001; k++) window.__key(w, 2, 'b', { ctrl: true });
      res.caret = { depth: dw.view.undoDepth - d0, pending: dw.view.pending };
      w.emit('textinput', { text: 'Q', window: w });
      dw.view.flush();
      res.typed = window.__runs(dw, 2);
      // a keystroke after it all is quick
      const t2 = performance.now();
      w.emit('textinput', { text: 'k', window: w });
      dw.view.flush();
      await window.__frames(1);
      res.after = Math.round(performance.now() - t2);
      res.undone = window.__undoAll(dw);
      res.restored = window.__json(dw) === before;
      dw.close();
      return res;
    });
    timings.push(`1000 Ctrl-B ${t.ms} ms (95th percentile ${t.p95} ms, worst ${t.worst} ms)`);
    ok('1000 Ctrl-B on a selection: under 5 s (95th percentile under 50 ms), 1000 undo steps (the cap), plain again, model valid',
      t.ms < 5000 && t.p95 < 50 && t.worst < 500 && t.depth === 1000 && !t.bad && !modelBad(t.json) && t.runs.length === 1 && !t.msgs,
      { ...t, json: undefined, model: modelBad(t.json) });
    ok('... 1001 at a caret: no undo step, pending bold, Q typed bold; a keystroke after it under 500 ms',
      t.caret.depth === 0 && t.caret.pending.b === true && t.typed.some(([s, f]) => s === 'Q' && f.b === true) && t.after < 500, t);
  }

  // ---------------------------------------------------- toolbar clicks while an input method composes
  {
    const cdp = await page.context().newCDPSession(page);
    const pt = await ev(async () => {
      const dw = await window.__open('Plain'), L = dw.view.layout, c = L.caretRect({ id: L.items[3].id, off: 2 });
      window.__ime0 = dw.view.lines()[3];
      return window.__client(dw.win, c.x + 1, c.y + c.h / 2);
    });
    await page.mouse.click(pt.x, pt.y);
    await settle();
    await cdp.send('Input.imeSetComposition', { text: '\u306b', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '\u306b\u307b', selectionStart: 2, selectionEnd: 2 });
    await settle();
    const c0 = await ev(() => ({ comp: window.__dw.view.composing }));
    const states = [];
    for (const name of ['bold', 'italic', 'alignCenter', 'fontBigger']) {
      const at = await ev((n) => window.__icon(n), name);
      await page.mouse.click(at.x, at.y);
      await wait(40);
      await settle();
      states.push(await ev(() => ({ comp: window.__dw.view.composing, line: window.__dw.view.lines()[3], msgs: window.__msgs.length,
        caret: os.wimp.caret?.window === window.__dw.win })));
    }
    // the input method goes on: more composing, then its commit
    await cdp.send('Input.imeSetComposition', { text: '\u306b\u307b\u3093', selectionStart: 3, selectionEnd: 3 });
    await cdp.send('Input.insertText', { text: '\u65e5\u672c' });
    await settle();
    const c1 = await ev(() => {
      const dw = window.__dw;
      return { comp: dw.view.composing, line: dw.view.lines()[3], runs: window.__runs(dw, 3), json: window.__json(dw), bad: window.__bad(dw),
        msgs: window.__msgs.length, head: dw.view.selection.head.off };
    });
    const base = await ev(() => window.__ime0);
    const typed = base.slice(0, 2) + '\u65e5\u672c' + base.slice(2);
    // the composition either survived each click or was cancelled with nothing left in the text
    const clean = states.every((s) => (s.comp === null || s.comp === '\u306b\u307b') && s.line === base && !s.msgs);
    ok('toolbar clicks while composing: the composition goes on or is cancelled, the text untouched, no errors; the caret stays',
      c0.comp === '\u306b\u307b' && clean && states.every((s) => s.caret), { c0, states, base });
    // (intended: the clicks at the caret set the pending format - bold, italic and one size step up, 11 -> 12 pt; the
    // centring is a paragraph command and leaves it - and the pending format survives the composition, so the committed
    // text carries it)
    const jp = c1.runs.find(([t]) => t === '\u65e5\u672c');
    ok('... the commit after it types its text once, where the caret was, with the pending format (bold, italic, 12 pt)',
      c1.comp === null && c1.line === typed && JSON.stringify(jp?.[1]) === JSON.stringify({ b: true, i: true, sz: 24, szCs: 24 })
      && c1.head === 4 && !c1.bad && !modelBad(c1.json) && !c1.msgs && !pageErrors(), { ...c1, json: undefined, typed });
    await ev(() => window.__dw.close());
    await cdp.detach();
  }

  // ---------------------------------------------------- each popup open while its window closes
  {
    const res = [];
    for (const name of ['styleMenu', 'fontMenu', 'sizeMenu', 'color', 'highlight']) {
      const before = await ev(async () => {
        await window.__open('Plain');
        return { wins: os.wimp.windows.size };
      });
      const at = await ev((n) => window.__icon(n), name);
      await page.mouse.click(at.x, at.y);
      await wait(60);
      await settle();
      const r1 = await ev(async () => {
        const open = os.wimp.menus.isOpen;
        window.__dw.close();
        await window.__frames(3);
        return { open, after: os.wimp.menus.isOpen, docs: window.__word().word.docs.length, msgs: window.__msgs.length, wins: os.wimp.windows.size };
      });
      res.push({ name, ...r1, before: before.wins });
    }
    // a click where the popup was, after: nothing
    const at = await ev(() => window.__client({ workToScreen: (x, y) => ({ x, y }) }, 400, 300));
    await page.mouse.click(at.x, at.y);
    await settle();
    ok('each toolbar popup (style, font, size, colour, highlight) open while its window closes: closed with it, no errors',
      res.every((x) => x.open && !x.after && x.docs === 0 && !x.msgs) && !pageErrors()
      && res.every((x) => x.wins === res[0].wins), res);
  }

  // ---------------------------------------------------- absurd sizes typed into the size field
  {
    await ev(async () => {
      const dw = await window.__open('Plain'), L = dw.view.layout;
      dw.view.setSelection({ id: L.items[1].id, off: 0 }, { id: L.items[1].id, off: 5 });
      await window.__frames(2);
    });
    const res = [];
    for (const text of ['999999', '-5', 'NaN', '1e3', '', '0', '0.2', '72.25']) {
      const at = await ev(() => window.__icon('size'));
      await page.mouse.click(at.x, at.y);
      await page.keyboard.press('Control+u');
      if (text) await page.keyboard.type(text);
      await page.keyboard.press('Enter');
      await settle();
      res.push([text, await ev(() => {
        const dw = window.__hook();
        return { sz: dw.d.doc.sections[0].blocks[1].runs[0].rPr.sz ?? null, field: dw.toolbar.text('size'),
          caret: os.wimp.caret?.window === dw.win, msgs: window.__msgs.length };
      })]);
    }
    const m = Object.fromEntries(res);
    // (the field takes digits and a point only, as its validation says: '-', 'N', 'a', 'e' are never typed into it, so
    // '-5' is 5, 'NaN' an empty field and '1e3' 13)
    ok('absurd sizes: 999999 -> 400 pt (clamped); -5 -> 5; NaN and an empty field refused (nothing changes, the field shows the'
      + ' size again); 1e3 -> 13; 0 and 0.2 -> 1 pt; 72.25 -> 72.5 (half points); the caret back in the document each time',
    m['999999'].sz === 800 && m['999999'].field === '400' && m['-5'].sz === 10 && m['-5'].field === '5' && m.NaN.sz === 10
      && m.NaN.field === '5' && m['1e3'].sz === 26 && m[''].sz === 26 && m[''].field === '13' && m['0'].sz === 2 && m['0.2'].sz === 2
      && m['72.25'].sz === 145 && m['72.25'].field === '72.5' && res.every(([, x]) => x.caret && !x.msgs), res);
    await ev(() => window.__dw.close());
  }

  // ---------------------------------------------------- zoom while the window is resized
  {
    const z = await ev(async () => {
      const dw = await window.__open('Mixed'), w = dw.win, L = dw.view.layout;
      dw.view.setSelection({ id: L.items[10].id, off: 3 });
      const bad = [];
      const sizes = [[860, 480], [300, 260], [1200, 700], [240, 200], [640, 400]];
      for (let k = 0; k < 20; k++) {
        const [ww, hh] = sizes[k % sizes.length];
        w.open({ x: 80 + k, y: 50, w: ww, h: hh, behind: 'top' });
        dw.setZoom([50, 200, 75, 400, 10, 150, 500, 100][k % 8]);
        // (typing scrolls the caret into view; a zoom alone keeps the centre of what is seen, not the caret)
        const typed = k % 3 === 0;
        if (typed) w.emit('textinput', { text: 'z', window: w });
        await window.__frames(2);
        const v = dw.view, top = v.layout.top, zz = dw.zoom / 100, L2 = v.layout, ru = dw.ruler;
        const eh = w.extent.y1 - w.extent.y0, want = Math.max(64, Math.ceil(top + (L2.height - top) * zz));
        const c = v.caretRect(), vis = { y0: w.scrollY + top, y1: w.scrollY + w.h };
        const why = [window.__bad(dw), eh === want ? '' : `extent ${eh} != ${want}`, ru.scale.zoom === zz ? '' : 'ruler zoom',
          !typed || (c.y >= vis.y0 - 1 && c.y < vis.y1 + 1) ? '' : `caret ${c.y} out of ${vis.y0}..${vis.y1}`, window.__msgs.length ? 'msgs' : '']
          .filter(Boolean).join(', ');
        if (why) bad.push(`${k} (${ww}x${hh} at ${dw.zoom}%): ${why}`);
      }
      const res = { bad, zoom: dw.zoom, json: window.__json(dw) };
      dw.setZoom(100);
      window.__undoAll(dw);
      dw.close();
      return res;
    });
    ok('zoom changed while the window is resized (10%..500%, 240..1200 px): extent and ruler follow, typing scrolls the caret'
      + ' into view below the bars; selection valid',
      !z.bad.length && !modelBad(z.json) && !pageErrors(), { bad: z.bad.slice(0, 5) });
  }

  // ---------------------------------------------------- 500 random actions
  {
    const box = await ev(async () => {
      const dw = await window.__open('Mixed', { h: 420 }), w = dw.win;
      window.__opened = window.__json(dw);
      const a = window.__client(w, w.scrollX, w.scrollY), b = window.__client(w, w.scrollX + w.w, w.scrollY + w.h);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y, top: dw.view.layout.top };
    });
    const rnd = rng(20261007), pick = (a) => a[Math.floor(rnd() * a.length)];
    const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageDown', 'PageUp', 'Escape', 'Control+a',
      'Enter', 'Backspace', 'Delete', 'Shift+ArrowRight', 'Shift+ArrowDown', 'Shift+End', 'Control+z', 'Control+y',
      'Control+b', 'Control+i', 'Control+u', 'Control+e', 'Control+r', 'Control+j', 'Control+l', 'Control+Space',
      'Control+Shift+Period', 'Control+Shift+Comma', 'Control+m', 'Control+Shift+m', 'Control+Equal', 'Control+Shift+Equal'];
    const TEXT = ['a', ' ', 'word ', '\u00e9', 'e\u0301', '\u{1F600}', '\u4e2d', 'x y'];
    const BUTTONS = ['bold', 'italic', 'underline', 'strike', 'superscript', 'subscript', 'alignLeft', 'alignCenter', 'alignRight',
      'alignJustify', 'indentMore', 'indentLess', 'clearFormat', 'fontBigger', 'fontSmaller', 'styleMenu', 'fontMenu', 'sizeMenu',
      'color', 'highlight'];
    const at = () => ({ x: box.x0 + 2 + rnd() * (box.x1 - box.x0 - 4), y: box.y0 + box.top + 2 + rnd() * (box.y1 - box.y0 - box.top - 4) });
    /** Click a random item of open menu level n (not one with a submenu); false if none. */
    const menuItem = async (n) => {
      const items = page.locator('.menu').nth(n).locator('.mitem');
      const k = await items.count();
      if (!k) return false;
      const it = items.nth(Math.floor(rnd() * k));
      const b = await it.boundingBox({ timeout: 500 }).catch(() => null);
      if (!b) return false;
      await page.mouse.click(b.x + 20, b.y + b.height / 2);
      await wait(60);
      return true;
    };
    const kinds = {};
    const bad = [];
    for (let k = 0; k < 500; k++) {
      const a = rnd();
      let what;
      if (a < 0.3) {
        what = pick(KEYS);
        await page.keyboard.press(what);
      } else if (a < 0.45) {
        what = 'text';
        await page.keyboard.insertText(pick(TEXT));
      } else if (a < 0.6) {
        const q = at(), b = rnd();
        what = 'mouse';
        if (b < 0.5) await page.mouse.click(q.x, q.y);
        else {
          const e = at();
          await page.mouse.move(q.x, q.y); await page.mouse.down();
          await page.mouse.move(e.x, e.y, { steps: 3 });
          await page.mouse.up();
        }
      } else if (a < 0.8) {
        const name = pick(BUTTONS);
        what = 'toolbar ' + name;
        const c = await ev((n) => window.__icon(n), name);
        await page.mouse.click(c.x, c.y);
        await wait(40);
        if (await ev(() => os.wimp.menus.isOpen)) {
          if (rnd() < 0.7) await menuItem(0);
          else await page.keyboard.press('Escape');
        }
      } else if (a < 0.88) {
        what = 'Format menu';
        const q = at();
        await page.mouse.click(q.x, q.y, { button: 'middle' });
        await wait(120);
        const fm = page.locator('.menu').nth(0).locator('.mitem', { hasText: /^Format/ }).first();
        const b = (await fm.count()) ? await fm.boundingBox({ timeout: 500 }).catch(() => null) : null;
        if (b) {
          await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 2 });
          await page.mouse.move(b.x + b.width - 6, b.y + b.height / 2, { steps: 3 });
          await wait(150);
          const items = page.locator('.menu').nth(1).locator('.mitem');
          const n = await items.count();
          if (n) {
            const it = items.nth(Math.floor(rnd() * n));
            const t = (await it.textContent({ timeout: 500 }).catch(() => '')) || '';
            what += ' ' + t.trim().slice(0, 12);
            const ib = await it.boundingBox({ timeout: 500 }).catch(() => null);
            if (ib && /^(Font|Size|Colour|Highlight|Align|Indent|Style)/.test(t.trim())) {
              await page.mouse.move(ib.x + 20, ib.y + ib.height / 2, { steps: 2 });
              await page.mouse.move(ib.x + ib.width - 6, ib.y + ib.height / 2, { steps: 3 });
              await wait(150);
              await menuItem(2);
            } else if (ib) {
              await page.mouse.click(ib.x + 20, ib.y + ib.height / 2);
              await wait(60);
            }
          }
        }
      } else if (a < 0.94) {
        what = 'zoom';
        const zz = pick([50, 75, 100, 150, 200]);
        await ev((zz) => window.__hook().setZoom(zz), zz);
      } else {
        what = 'ruler';
        const m = await ev((id) => {
          const ru = window.__hook().ruler, mk = ru.markers.find((x) => x.id === id);
          if (!mk || !ru.pane.isOpen) return null;
          const y = mk.kind === 'down' ? 3 : mk.kind === 'up' ? Math.round(ru.height * 0.62) : ru.height - 2;
          return window.__client(ru.pane, ru._x(mk.twips), y);
        }, pick(['left', 'first', 'hanging', 'right']));
        if (m) {
          await page.mouse.move(m.x, m.y); await page.mouse.down();
          await page.mouse.move(m.x + (rnd() * 2 - 1) * 200, m.y + (rnd() < 0.2 ? 300 : 0), { steps: 4 });
          await page.mouse.up();
        }
      }
      const kind = a < 0.3 ? 'key' : what.split(' ')[0];
      kinds[kind] = (kinds[kind] || 0) + 1;
      const s = await ev(async () => {
        await window.__frames(1);
        const dw = window.__hook();
        if (!dw) return { why: 'window gone', json: '[]' };
        const why = window.__bad(dw) + (window.__msgs.length ? ' msgs ' + window.__msgs.slice(-1) : '');
        if (os.wimp.menus.isOpen) os.wimp.menus.close();
        if (dw.toolbar.editing) dw.view.flush();
        return { why, json: window.__json(dw), editing: dw.toolbar.editing };
      });
      if (s.editing) await page.keyboard.press('Escape');
      const mb = modelBad(s.json);
      if ((s.why || mb) && bad.length < 5) bad.push(`${k} (${what}): ${s.why} ${mb}`);
      if (s.why === 'window gone') break;
    }
    const end = await ev(() => {
      const dw = window.__hook();
      dw.setZoom(100);
      const n = window.__undoAll(dw);
      const res = { n, same: window.__json(dw) === window.__opened, dirty: dw.view.dirty, bad: window.__bad(dw), errs: window.__msgs.length };
      dw.close();
      return res;
    });
    ok('500 random keys, text, mouse, toolbar clicks, Format menu choices, zoom changes and ruler drags: selection and every block '
      + 'valid after each, no errors; undoing everything gives back the opened model', !bad.length && end.same && !end.dirty && !end.bad
      && !end.errs && !pageErrors() && Object.keys(kinds).length === 7, { bad, end, kinds });
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
