// !Word's tab stops against hostile input in the real desktop:
// a paragraph with 10,000 stops kept raw (64 shown on the ruler, edits
// refused, layout quick, Tabs typed in it); stops at +-31680 twips and
// far beyond in a file (laid out sanely) and through the commands
// (beyond +-31680 refused, nothing changes); 1000 ruler adds (the 64
// own stops the paragraph can hold, the rest refused) and a
// 1000-command add / move / remove churn, one undo step each change,
// undo whole; Tab storms in a right-tab line (300 real Tab presses
// and 700 commands: valid layout, nothing past the right edge, the
// right-aligned text stays); 500 seeded random actions (keys incl.
// Tab, text, clicks and drags, the ruler / Tabs dialog ids, the
// default tab stop, the Format menu) with the selection and the model
// valid after each, and undo of everything giving back the opened
// model and settings. No page errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, settingsXml, p, r } from './build-docx.mjs';
import { rng } from './word-docs.mjs';
import { checkBlock } from '../../tools/moreapps/!Word/ModelCheck';

const SETTINGS = settingsXml('<w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>');
const docx = async (body) => Array.from(await buildDocx({ 'word/document.xml': documentXml(body), 'word/settings.xml': SETTINGS }));
const tabbed = (...parts) => `<w:r>${parts.map((t, i) => (i ? '<w:tab/>' : '') + `<w:t>${t}</w:t>`).join('')}</w:r>`;
const stopsXml = (n, step = 20) => `<w:tabs>${Array.from({ length: n }, (_, k) => `<w:tab w:val="${['left', 'center', 'right', 'decimal'][k % 4]}" w:pos="${step * (k + 1)}"/>`).join('')}</w:tabs>`;
const EXTREME = `<w:tabs><w:tab w:val="left" w:pos="31680"/><w:tab w:val="right" w:pos="-31680"/><w:tab w:val="center" w:pos="1000000"/>`
  + `<w:tab w:val="decimal" w:pos="-1000000"/><w:tab w:val="left" w:pos="2147483647"/><w:tab w:val="right" w:pos="-2147483648"/></w:tabs>`;
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const MIXED = Array.from({ length: 10 }, (_, i) => p(tabbed(`Item ${i}`, WORDS[i % 10], '12.50'), i % 3 === 0 ? '<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="6000"/></w:tabs>' : '')).join('')
  + p(r('The end.'));
const files = {
  Many: await docx(p(tabbed('a', 'b', 'c', 'd'), stopsXml(10000)) + p(tabbed('Plain', 'line'))),
  Far: await docx(p(tabbed('far', 'left', 'right', 'centre', 'dec', 'x'), EXTREME) + p(tabbed('Plain', 'line'))),
  Adds: await docx(p(tabbed('Add', 'stops', 'here')) + p(tabbed('Second', 'one')) + p(r('Third'))),
  Right: await docx(p(tabbed('Total', '12.50'), '<w:tabs><w:tab w:val="right" w:pos="6000"/></w:tabs>') + p(r('plain'))),
  Mixed: await docx(MIXED),
};

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
    for (const s of JSON.parse(json).sections) for (const b of s.blocks) checkBlock(b);
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
    window.__json = (d) => JSON.stringify({ sections: d.d.doc.sections, settings: d.d.doc.rawSettings });
    window.__undoAll = (d) => { let n = 0; while (d.d.canUndo && n < 5000) { d.view.press('undo'); n++; } d.view.flush(); return n; };
    window.__at = (d, i, off = 0) => d.view.setSelection({ id: d.view.layout.items[i].id, off });
    window.__atEnd = (d, i) => d.view.setSelection({ id: d.view.layout.items[i].id, off: d.view.layout.items[i].block.text.length });
    window.__run = (d, id) => d.dw.view.run(id);
    window.__tabs = (d, i) => d.d.doc.sections[0].blocks[i].pPr?.tabs;
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = () => { window.__beeps++; return beep(); };
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    /** '' when the selection and the layout are valid. */
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
        for (const l of it.lines || []) {
          for (const w of l.items || []) {
            if (!Number.isFinite(w.x) || !Number.isFinite(w.w) || w.w < 0) return `item ${it.id} piece x ${w.x} w ${w.w}`;
          }
        }
      }
      return '';
    };
    /** The widest right edge of any line piece in paragraph i (px from the item's left). */
    window.__right = (d, i) => {
      let m = 0;
      for (const l of d.view.layout.items[i].lines || []) for (const w of l.items || []) m = Math.max(m, w.x + w.w);
      return m;
    };
    window.__menu = (d, ...names) => {
      let m = d.win.menu({}), it;
      for (const n of names) { it = m.items.find((i) => i.text === n); if (!it) return null; m = it.submenu ? it.submenu() : null; }
      return it;
    };
  }, files);

  // ---------------------------------------------------- 10,000 stops kept raw
  {
    const t0 = Date.now();
    const o = await ev(async () => {
      const d = await window.__open('Many');
      window.__opened = window.__json(d);
      const t = performance.now();
      d.win.invalidate();
      await window.__frames(3);
      return { paint: performance.now() - t, markers: d.ruler.markers.filter((m) => m.kind.startsWith('tab')).length, bad: window.__bad(d) };
    });
    await ev(() => window.__at(window.__d(), 0, 0));
    // edits refused with a beep, nothing changes; Tabs typed in it
    const e = await ev(() => {
      const d = window.__d(), v = d.view, b0 = window.__beeps, depth = v.undoDepth;
      const res = [v.format('tabs', { add: { val: 'left', pos: 100 } }), v.format('tabs', { remove: 20 }), v.format('tabs', { move: { from: 20, to: 100 } }),
        v.format('tabs', { set: [] }), v.format('tabsBox', { tabs: { edits: [{ add: { val: 'left', pos: 100 } }] } })];
      return { res, beeps: window.__beeps - b0, depth: v.undoDepth - depth, same: window.__json(d) === window.__opened };
    });
    await page.keyboard.press('End');
    for (let k = 0; k < 50; k++) await page.keyboard.press('Tab');
    await settle();
    const t = await ev(() => {
      const d = window.__d(), res = { bad: window.__bad(d), items: d.view.layout.items.length, msgs: window.__msgs.length };
      window.__undoAll(d);
      res.back = window.__json(d) === window.__opened;
      window.__real.close();
      return res;
    });
    timings.push(`10,000 stops: open + paint ${Math.round(o.paint)} ms, ${Date.now() - t0} ms in all`);
    ok('10,000 stops kept raw: opens and paints under 4 s, the ruler shows at most 64 stops, five edit gestures refused (view.format gives false and no undo step; the ruler beep is in RulerBind, tested in word-ruler.mjs), '
      + '50 Tab presses laid out validly; undo gives back the opened model', o.paint < 4000 && o.markers <= 64 && !o.bad
      && e.res.every((x) => !x) && e.depth === 0 && e.same && !t.bad && t.back && !t.msgs, { o, e, t });
  }

  // ---------------------------------------------------- positions at and beyond +-31680
  {
    const o = await ev(async () => {
      const d = await window.__open('Far');
      window.__opened = window.__json(d);
      d.win.invalidate();
      await window.__frames(3);
      window.__at(d, 0, 0);
      const first = { bad: window.__bad(d), right: window.__right(d, 0), tabs: window.__tabs(d, 0)?.length };
      const v = d.view, depth = v.undoDepth, b0 = window.__beeps;
      const odd = [31681, -31681, 2147483648, 1e9, -1e9, NaN, Infinity, -Infinity, 1.5, '720', null, undefined, {}, [], 1e-9];
      const results = [];
      // the commands on a paragraph without raw stops (paragraph 1)
      window.__at(d, 1, 0);
      for (const pos of odd) {
        for (const id of ['tabs']) {
          let r1;
          try { r1 = v.format(id, { add: { val: 'left', pos } }); } catch (e) { r1 = 'threw ' + e.message; }
          results.push([String(pos), r1]);
        }
      }
      const edge = [v.format('tabs', { add: { val: 'right', pos: 31680 } }), v.format('tabs', { add: { val: 'left', pos: 0 } }),
        v.format('tabs', { move: { from: 31680, to: 31680.4 } }), v.format('tabs', { move: { from: 31680, to: 99999999 } })];
      v.flush();
      await window.__frames(2);
      return { first, results, edge, stops: window.__tabs(d, 1), bad: window.__bad(d), depthDelta: v.undoDepth - depth, beeps: window.__beeps - b0 };
    });
    const fin = await ev(() => {
      const d = window.__d(), res = { bad: window.__bad(d), msgs: window.__msgs.length };
      window.__undoAll(d);
      res.back = window.__json(d) === window.__opened;
      window.__real.close();
      return res;
    });
    ok('stops at +-31680, 1,000,000 and the 32-bit limits in a file: laid out validly with finite pieces; positions past +-31680 clamped to the limit by the add command (as FormatTabs rounds and clamps), '
      + 'NaN, Infinity, strings and objects refused without an exception, nothing written; 31680 and 0 accepted; undo gives back the opened model',
    !o.first.bad && Number.isFinite(o.first.right) && o.results.every(([k, v]) => (['NaN', 'Infinity', '-Infinity', '720', 'null', 'undefined', '[object Object]', ''].includes(k)) === (v === false))
      && o.stops.every((x) => Math.abs(x.pos) <= 31680) && o.stops.some((x) => x.pos === 31680) && o.stops.some((x) => x.pos === -31680)
      && o.edge[0] === true && o.edge[1] === true && !o.bad && !fin.bad && fin.back && !fin.msgs, { o, fin });
  }

  // ---------------------------------------------------- 1000 ruler adds, and a churn
  {
    const o = await ev(async () => {
      const d = await window.__open('Adds'), v = d.view;
      window.__opened = window.__json(d);
      window.__at(d, 0, 0);
      let worst = 0, accepted = 0, refused = 0, changed = 0;
      const kinds = ['left', 'center', 'right', 'decimal', 'bar'];
      for (let k = 0; k < 1000; k++) {
        const t = performance.now(), depth = v.undoDepth;
        const done = v.format('tabs', { add: { val: kinds[k % 5], pos: 20 + (k * 37) % 9000, leader: k % 3 ? undefined : 'dot' } });
        worst = Math.max(worst, performance.now() - t);
        if (done) accepted++; else refused++;
        if (v.undoDepth > depth) changed++;
      }
      v.flush();
      await window.__frames(2);
      const res = { worst, accepted, refused, changed, own: window.__tabs(d, 0)?.length, bad: window.__bad(d), depth: v.undoDepth,
        markers: d.ruler.markers.filter((m) => m.kind.startsWith('tab')).length };
      // a churn: move and remove the stops of paragraph 0 and add elsewhere, 1000 commands
      let seed = 4242;
      const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      let cw = 0;
      for (let k = 0; k < 1000; k++) {
        const own = window.__tabs(d, 0) || [], t = performance.now();
        const x = rnd();
        if (x < 0.4 && own.length) v.format('tabs', { move: { from: own[Math.floor(rnd() * own.length)].pos, to: Math.floor(rnd() * 9000) } });
        else if (x < 0.7 && own.length) v.format('tabs', { remove: own[Math.floor(rnd() * own.length)].pos });
        else v.format('tabs', { add: { val: kinds[Math.floor(rnd() * 5)], pos: Math.floor(rnd() * 9000) } });
        cw = Math.max(cw, performance.now() - t);
        if (k % 50 === 0) window.__atEnd(d, k % 3);
        if (k % 50 === 25) window.__at(d, 0, 0);
      }
      v.flush();
      await window.__frames(2);
      res.churnWorst = cw;
      res.afterBad = window.__bad(d);
      res.json = window.__json(d);
      const t1 = performance.now();
      res.undone = window.__undoAll(d);
      res.undoMs = performance.now() - t1;
      res.back = window.__json(d) === window.__opened;
      window.__real.close();
      return res;
    });
    timings.push(`1000 ruler adds: worst ${Math.round(o.worst)} ms; churn worst ${Math.round(o.churnWorst)} ms; undo all ${Math.round(o.undoMs)} ms`);
    ok('1000 ruler adds: the paragraph holds at most 64 own stops (the rest refused), each add under 250 ms, one undo step per change, the ruler shows the stops; '
      + 'a 1000-command add / move / remove churn stays valid and each command under 250 ms; undoing everything under 8 s gives back the opened model',
    o.own <= 64 && o.accepted >= 60 && o.refused >= 900 && o.changed === o.depth && o.worst < 250 && !o.bad && o.markers <= 64 && o.churnWorst < 250 && !o.afterBad
      && !modelBad(o.json) && o.undoMs < 8000 && o.back && !o.msgs, { ...o, json: undefined });
  }

  // ---------------------------------------------------- Tab storms in a right-tab line
  {
    await ev(async () => { const d = await window.__open('Right'); window.__opened = window.__json(d); window.__atEnd(d, 0); });
    const t0 = Date.now();
    for (let k = 0; k < 300; k++) await page.keyboard.press('Tab');
    await settle();
    const real = Date.now() - t0;
    const o = await ev(async () => {
      const d = window.__d(), v = d.view;
      let worst = 0;
      for (let k = 0; k < 600; k++) {
        const t = performance.now();
        v.type('\t');
        worst = Math.max(worst, performance.now() - t);
        if (k % 100 === 50) { v.type('x'); }
      }
      v.flush();
      await window.__frames(2);
      const L = v.layout, it = L.items[0];
      const res = { worst, lines: it.lines.length, right: window.__right(d, 0), bad: window.__bad(d), text: it.block.text.length, json: window.__json(d),
        msgs: window.__msgs.length };
      // the stop is at 6000 twips = 400 px; the text must not pass the right edge of the page area
      res.width = d.win.extent.x1 - d.win.extent.x0;
      const t1 = performance.now();
      res.undone = window.__undoAll(d);
      res.undoMs = performance.now() - t1;
      res.back = window.__json(d) === window.__opened;
      if (!res.back) { const a = window.__json(d), b = window.__opened; let i = 0; while (a[i] === b[i]) i++; res.diff = [a.slice(Math.max(0, i - 80), i + 120), b.slice(Math.max(0, i - 80), i + 120), a.length, b.length]; }
      window.__real.close();
      return res;
    });
    timings.push(`Tab storm: 300 real Tabs ${real} ms, worst of 600 ${Math.round(o.worst)} ms, ${o.lines} lines, undo all ${Math.round(o.undoMs)} ms`);
    ok('Tab storm in a right-tab line (300 real presses, 600 commands; the history keeps 1000 steps): the layout stays valid, the line count finite, no piece past the page width, each command under 250 ms; '
      + 'undo gives back the opened model', o.text >= 900 && o.lines >= 1 && o.lines < 5000 && !o.bad && !modelBad(o.json) && o.right <= o.width + 1 && o.worst < 250
      && o.undoMs < 8000 && o.back && !o.msgs, { ...o, json: undefined });
  }

  // ---------------------------------------------------- 500 random actions
  {
    const box = await ev(async () => {
      const d = await window.__open('Mixed', { h: 420 }), w = d.win;
      window.__opened = window.__json(d);
      const a = window.__client(w, w.scrollX, w.scrollY), b = window.__client(w, w.scrollX + w.w, w.scrollY + w.h);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y, top: d.view.layout.top };
    });
    const rnd = rng(20261011), pick1 = (a) => a[Math.floor(rnd() * a.length)];
    const KEYS = ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Control+z', 'Control+y', 'Backspace', 'Delete', 'Enter', 'Home', 'End', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Shift+ArrowDown', 'Shift+End', 'Control+a', 'Control+Backspace', 'Escape'];
    const TEXT = ['a', ' ', '1.5', 'word ', 'é', '\u{1F600}'];
    const VAL = ['left', 'center', 'right', 'decimal', 'bar', 'wavy'];
    const POS = () => pick1([0, 360, 720, 1440, 2880, 6000, Math.floor(rnd() * 9000), 31680, 31681, -1, NaN, 1e9]);
    const arg = () => {
      const x = rnd();
      if (x < 0.3) return ['tabs', { add: { val: pick1(VAL), pos: POS(), leader: pick1([undefined, 'dot', 'hyphen', 'underscore', 'none', 'bogus']) } }];
      if (x < 0.45) return ['tabs', { remove: POS() }];
      if (x < 0.6) return ['tabs', { move: { from: POS(), to: POS() } }];
      if (x < 0.7) return ['tabs', { set: Array.from({ length: Math.floor(rnd() * 4) }, () => ({ val: pick1(VAL), pos: POS() })) }];
      if (x < 0.85) return ['tabsBox', { tabs: { edits: [{ add: { val: pick1(VAL), pos: POS() } }, { remove: POS() }] } }];
      if (x < 0.95) return ['tabsBox', { defaultTab: pick1([360, 720, 1440, 567, 36, 31680, 35, 0, -5, 1e9]) }];
      return ['tabs', { bogus: 1 }];
    };
    const MENU = [['Format', 'Tabs...'], ['Format', 'Paragraph...'], ['Insert', 'Page break']];
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
      } else if (a < 0.62) {
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
        const [id, ar] = arg();
        what = 'id ' + id;
        await ev(([id, ar]) => { try { window.__d().view.format(id, ar); } catch (e) { if (!(e instanceof RangeError) && !/bad|refus|invalid/i.test(e.message)) window.__msgs.push('threw ' + e.message); } }, [id, ar]);
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
        if (!d || !window.__doc(window.__cur)) return { why: 'window gone', json: '{"sections":[]}' };
        const why = window.__bad(d) + (window.__msgs.length ? ' msgs ' + window.__msgs.slice(-1) : '');
        if (os.wimp.menus.isOpen) os.wimp.menus.close();
        // dialogs a menu item opened: close them (Escape in the box)
        for (const key of ['tabs', 'para']) if (d.dw.boxes.has(key)) d.dw.boxes.get(key).close?.();
        return { why, json: window.__json(d) };
      });
      const mb = modelBad(s.json);
      if ((s.why || mb) && bad.length < 5) bad.push(`${k} (${what}): ${s.why} ${mb}`);
      if (s.why === 'window gone') break;
    }
    const end = await ev(() => {
      const d = window.__d();
      const n = window.__undoAll(d);
      const res = { n, same: window.__json(d) === window.__opened, dirty: d.view.dirty, bad: window.__bad(d), errs: window.__msgs.length };
      window.__real.close();
      return res;
    });
    ok('500 random keys (Tab among them), text, clicks and drags, the tab stop ids (hostile positions, kinds and leaders, the default tab stop) and the Format menu\'s items: '
      + 'selection and every block valid after each, no errors; undoing everything gives back the opened model and settings',
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
