// !Word's caret and selection against hostile and odd documents in the
// real desktop (the documents of hostile-docs.mjs: a 100,000-character
// word, 50,000 runs, 5000 tabs, absurd indents and page sizes, only
// inlines, tables first and last, an empty document): each opens and is
// drawn; clicks (at extreme places too) and keys take under 50 ms each
// and keep the selection valid. Then: a drag held outside the window at
// the end of its scrolling draws nothing more; a drag while the window
// closes, and the document opened again; 500 random keys and mouse
// actions on a mixed document. No page errors, no error boxes.
// Needs the disc built by tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { BODIES, docxOf } from './hostile-docs.mjs';
import { rng } from './word-docs.mjs';

const NAMES = Object.keys(BODIES);
const files = {};
for (const n of NAMES) files[n] = Array.from(await docxOf(n));

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail).slice(0, 600)}`);
const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
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
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' }), cache = new WeakMap();
    /** '' if the selection of DocWindow dw is valid, else what is wrong. */
    window.__bad = (dw) => {
      const L = dw.view.L, s = dw.view.sel;
      if (!s) return L.items.length ? 'no selection' : '';
      for (const p of [s.anchor, s.head]) {
        const it = L.byId.get(p.id);
        if (!it) return `no item ${p.id}`;
        if (!Number.isInteger(p.off) || p.off < 0) return `off ${p.off}`;
        const loc = L.locate(p);
        if (loc.off !== p.off) return `clamped ${p.off} -> ${loc.off}`;
        if (it.kind === 'box') { if (p.off > 1) return 'box off'; continue; }
        let b = cache.get(it.block);
        if (!b) {
          b = new Set([it.block.text.length]);
          for (const g of seg.segment(it.block.text)) b.add(g.index);
          cache.set(it.block, b);
        }
        if (!b.has(p.off)) return `${p.off} inside a cluster`;
      }
      return '';
    };
    // open Word with the first document
    await os.filer.run('RAM::RamDisc0.$.pageNone');
    for (let i = 0; i < 100 && !window.__word()?.word.docs.length; i++) await window.__sleep(50);
  }, files);

  // ---------------------------------------------------- each hostile document
  for (const name of NAMES) {
    const r = await ev(async (name) => {
      const t = window.__word(), t0 = performance.now();
      const dw = await t.word.open(`RAM::RamDisc0.$.${name}`);
      const openMs = performance.now() - t0;
      if (!dw) return { name, fail: 'did not open', msgs: window.__msgs };
      const w = dw.win;
      w.open({ x: 80, y: 60, w: 700, h: 400, behind: 'top', scrollX: 0, scrollY: 0 });
      // a whole redraw, timed
      let paintMs = 0;
      const paint = dw.paint.bind(dw);
      dw.paint = (g, rc) => { const s = performance.now(); paint(g, rc); paintMs = Math.max(paintMs, performance.now() - s); };
      w.invalidate();
      await window.__frames(2);
      const res = { name, openMs, paintMs, worst: 0, what: '', bad: [], items: dw.view.L.items.length };
      const time = (what, fn) => {
        const s = performance.now();
        fn();
        const d = performance.now() - s;
        if (d > res.worst) { res.worst = d; res.what = what; }
        const why = window.__bad(dw);
        if (why && res.bad.length < 4) res.bad.push(`${what}: ${why}`);
      };
      const X = [-1e6, -1, 0, 50, 300, 690, 1e5, 1e9], Y = [-1e6, 0, 30, 200, dw.view.L.height / 2, dw.view.L.height - 5, 1e9];
      for (const x of X) {
        for (const y of Y) {
          for (const button of ['select', 'adjust']) {
            time(`click ${button} ${x},${y}`, () => w.emit('click', { button, x, y, shift: false, ctrl: false, window: w, kind: 'click' }));
          }
          time(`double ${x},${y}`, () => w.emit('doubleclick', { button: 'select', x, y, shift: false, ctrl: false, window: w, kind: 'double' }));
        }
      }
      // moving keys only: ['a', 1] is Ctrl-A (code 1, select all), which
      // Keys takes before any typing, so nothing here edits (checked:
      // res.dirty); typing is the explicit check after it
      const KEYS = [['ArrowLeft', 0x18C], ['ArrowRight', 0x18D], ['ArrowDown', 0x18E], ['ArrowUp', 0x18F], ['End', 0x18B], ['Home', 30],
        ['PageDown', 0x19E], ['PageUp', 0x19F], ['a', 1], ['Escape', 27]];
      for (const start of [() => dw.view.L.docStart(), () => dw.view.L.docEnd()]) {
        for (const [key, code] of KEYS) {
          for (const mods of [{}, { shift: true }, { ctrl: true }, { shift: true, ctrl: true }]) {
            const p = start();
            if (p) dw.view.setSelection({ anchor: p, head: p, affinity: 'down', goalX: null });
            for (let k = 0; k < 3; k++) {
              time(`key ${key} ${JSON.stringify(mods)}`, () => w.emit('key', { code, key, shift: !!mods.shift, ctrl: !!mods.ctrl }));
            }
          }
        }
      }
      res.dirty = dw.d.dirty;
      // typing, Enter and Backspace at both ends, laid out and drawn
      // (flush), then all undone
      res.typeMs = 0;
      for (const start of [() => dw.view.L.docStart(), () => dw.view.L.docEnd()]) {
        const p = start();
        if (!p) continue;
        dw.view.setSelection({ anchor: p, head: p, affinity: 'down', goalX: null });
        for (const e of [['textinput', { text: 'x\u{1F600}', window: w }], ['key', { code: 13, key: 'Enter' }],
          ['key', { code: 8, key: 'Backspace' }], ['key', { code: 8, key: 'Backspace' }]]) {
          const t0 = performance.now();
          w.emit(e[0], e[1]);
          dw.view.flush();
          res.typeMs = Math.max(res.typeMs, performance.now() - t0);
          const b = window.__bad(dw);
          if (b) res.bad.push(`after ${e[0]}: ${b}`);
        }
      }
      while (dw.d.canUndo) dw.view.undo();
      dw.view.flush();
      res.undone = !dw.d.dirty;
      // repaints at the far ends
      w.scrollTo(1e9, 1e9);
      await window.__frames(2);
      w.scrollTo(0, 0);
      await window.__frames(2);
      res.paintMs = Math.max(res.paintMs, paintMs);
      res.msgs = window.__msgs.length;
      dw.close();
      return res;
    }, name);
    ok(`${name}: opens (in ${Math.round(r.openMs)} ms) and is drawn (${Math.round(r.paintMs)} ms)`, !r.fail && r.openMs < 5000 && r.paintMs < 250 && !r.msgs
      && (name === 'empty' ? r.items === 0 : r.items > 0), r);
    ok(`${name}: clicks and keys under 50 ms (worst ${r.worst?.toFixed(1)} ms: ${r.what}), the selection valid, nothing edited`, r.worst < 50 && !r.bad?.length && r.dirty === false, r);
    ok(`${name}: typing, Enter and Backspace at both ends under 250 ms (worst ${r.typeMs?.toFixed(1)} ms), valid, all undone`, r.typeMs < 250 && !r.bad?.length && r.undone, r);
  }

  // ---------------------------------------------------- real clicks at the window's far corners
  {
    const corners = await ev(async () => {
      const dw = await window.__word().word.open('RAM::RamDisc0.$.word'), w = dw.win;
      w.open({ x: 80, y: 60, w: 600, h: 300, behind: 'top' });
      window.__dw = dw;
      await window.__frames(2);
      return [[2, 2], [w.w - 3, 2], [2, w.h - 3], [w.w - 3, w.h - 3]];
    });
    const seen = [];
    for (const [x, y] of corners) {
      for (const sc of [[0, 0], [1e9, 1e9]]) {
        const q = await ev(async ([x, y, sx, sy]) => {
          const w = window.__dw.win;
          w.scrollTo(sx, sy);
          await window.__frames(1);
          return window.__client(w, w.scrollX + x, w.scrollY + y);
        }, [x, y, ...sc]);
        await page.mouse.click(q.x, q.y);
        await page.waitForTimeout(420);       // (not a double-click)
        seen.push(await ev(() => window.__bad(window.__dw)));
      }
    }
    ok('real clicks at the far corners of a 100,000-character word: valid places', seen.every((x) => x === ''), seen);
    await ev(() => window.__dw.close());
  }

  // ---------------------------------------------------- held outside at the end of the scrolling: nothing more drawn
  {
    const q = await ev(async () => {
      const dw = await window.__word().word.open('RAM::RamDisc0.$.mixed'), w = dw.win;
      w.open({ x: 80, y: 60, w: 600, h: 300, behind: 'top' });
      w.scrollTo(0, 1e9);
      await window.__frames(2);
      window.__dw = dw;
      window.__paints = 0;
      const paint = dw.paint.bind(dw);
      dw.paint = (g, rc) => { window.__paints++; paint(g, rc); };
      const L = dw.view.L, it = L.items[L.items.length - 1], c = L.caretRect({ id: it.id, off: 2 });
      return { a: window.__client(w, c.x, c.y + c.h / 2), out: window.__client(w, 20, w.scrollY + w.h + 50), left: window.__client(w, -40, w.scrollY + w.h + 50) };
    });
    await page.mouse.move(q.a.x, q.a.y); await page.mouse.down();
    await page.mouse.move(q.a.x - 5, q.a.y + 5, { steps: 2 });
    await page.mouse.move(q.out.x, q.out.y, { steps: 3 });
    await page.waitForTimeout(250);
    const p0 = await ev(() => ({ n: window.__paints, y: window.__dw.win.scrollY, x: window.__dw.win.scrollX }));
    await page.waitForTimeout(600);
    const p1 = await ev(() => ({ n: window.__paints, y: window.__dw.win.scrollY }));
    await page.mouse.move(q.left.x, q.left.y, { steps: 2 });
    await page.waitForTimeout(250);
    const p2 = await ev(() => window.__paints);
    await page.waitForTimeout(600);
    const p3 = await ev(() => ({ n: window.__paints, x: window.__dw.win.scrollX, bad: window.__bad(window.__dw) }));
    await page.mouse.up();
    ok('a drag held below the window at the end of its scrolling draws nothing more', p1.n === p0.n && p1.y === p0.y, { p0, p1 });
    ok('... nor held left of it at scroll 0', p3.n === p2 && p3.x === 0 && !p3.bad, { p2, p3 });
    await ev(() => window.__dw.close());
  }

  // ---------------------------------------------------- a drag while the window closes; open again
  {
    const q = await ev(async () => {
      const dw = await window.__word().word.open('RAM::RamDisc0.$.word'), w = dw.win;
      w.open({ x: 80, y: 60, w: 600, h: 300, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      window.__dw = dw;
      const L = dw.view.L, c = L.caretRect({ id: L.items[0].id, off: 3 });
      return { a: window.__client(w, c.x, c.y + c.h / 2), out: window.__client(w, 100, w.h + 60) };
    });
    await page.mouse.move(q.a.x, q.a.y); await page.mouse.down();
    await page.mouse.move(q.a.x + 30, q.a.y, { steps: 3 });
    await page.mouse.move(q.out.x, q.out.y, { steps: 3 });
    await page.waitForTimeout(150);
    // close it from its menu while the button is held
    await ev(() => window.__dw.win.menu({}).items.find((i) => i.text === 'Close').action());
    await page.mouse.move(q.out.x + 40, q.out.y + 40, { steps: 4 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(100);
    const gone = await ev(() => ({ docs: window.__word().word.docs.length, alive: !!window.__word() }));
    const again = await ev(async () => {
      const dw = await window.__word().word.open('RAM::RamDisc0.$.word'), w = dw.win;
      w.open({ x: 80, y: 60, w: 600, h: 300, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      window.__dw = dw;
      const L = dw.view.L, c = L.caretRect({ id: L.items[0].id, off: 5 });
      return window.__client(w, c.x, c.y + c.h / 2);
    });
    await page.mouse.click(again.x, again.y);
    await page.keyboard.press('Shift+ArrowRight');
    const s = await ev(() => { const v = window.__dw.view; return { a: v.sel.anchor.off, h: v.sel.head.off, bad: window.__bad(window.__dw), focus: os.wimp.caret?.window === window.__dw.win }; });
    ok('a drag while its window closes: the document closes, nothing breaks', gone.alive && gone.docs === 0, gone);
    ok('... and it opens again and works (click, Shift-Right)', s.a === 5 && s.h === 6 && !s.bad && s.focus, s);
    await ev(() => window.__dw.close());
  }

  // ---------------------------------------------------- 500 random keys and mouse actions
  {
    const box = await ev(async () => {
      const dw = await window.__word().word.open('RAM::RamDisc0.$.mixed'), w = dw.win;
      w.open({ x: 80, y: 60, w: 640, h: 360, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      window.__dw = dw;
      // (the document below the toolbar: its buttons open popups)
      const a = window.__client(w, w.scrollX, w.scrollY + dw.view.inset), b = window.__client(w, w.scrollX + w.w, w.scrollY + w.h);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    });
    const rnd = rng(11), pick = (a) => a[Math.floor(rnd() * a.length)];
    const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Control+a'];
    const MODS = ['', 'Shift+', 'Control+', 'Shift+Control+'];
    const at = () => ({ x: box.x0 + 2 + rnd() * (box.x1 - box.x0 - 4), y: box.y0 + 2 + rnd() * (box.y1 - box.y0 - 4) });
    const bad = [];
    for (let k = 0; k < 500; k++) {
      const a = rnd();
      if (a < 0.6) {
        const key = pick(KEYS);
        await page.keyboard.press(key.startsWith('Control') || key === 'Escape' ? key : pick(MODS) + key);
      } else {
        const p = at();
        const b = rnd();
        if (b < 0.35) await page.mouse.click(p.x, p.y);
        else if (b < 0.5) { await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Shift'); }
        else if (b < 0.65) await page.mouse.dblclick(p.x, p.y);
        else if (b < 0.75) await page.mouse.click(p.x, p.y, { clickCount: 3 });
        else {
          const e = rnd() < 0.3 ? { x: p.x, y: box.y1 + 30 } : at();
          await page.mouse.move(p.x, p.y); await page.mouse.down();
          await page.mouse.move(e.x, e.y, { steps: 3 });
          if (e.y > box.y1) await page.waitForTimeout(130);
          await page.mouse.up();
        }
      }
      const why = await ev(() => window.__bad(window.__dw) + (window.__msgs.length ? ' msgs' : '') + (os.wimp.menus.isOpen ? ' menu' : ''));
      if (why && bad.length < 5) bad.push(`${k}: ${why}`);
      if (why.includes('menu')) await ev(() => os.wimp.menus.close());
    }
    const end = await ev(() => ({ docs: window.__word().word.docs.length, focus: os.wimp.caret?.window === window.__dw.win }));
    ok('500 random keys and mouse actions keep the selection valid', !bad.length && end.docs === 1 && end.focus, { bad, end });
  }
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
