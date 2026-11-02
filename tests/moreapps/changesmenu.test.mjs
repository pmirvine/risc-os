// The tracked-change items of the Tools menu and their keys (Batch
// F2): ./ToolsMenu's order, ticks and shading (header, footer and
// note modes; nothing to do; refusals, with the reason as the
// item's help), the commands behind them (./ChangesBox: Track
// Changes one undo step and its tick after undo, Accept / Reject,
// Accept All with its notice, Next / Previous per view, Show
// Markup), and the key table: Ctrl+Shift+E, Alt+Shift+Down / Up,
// no key bound twice (also against ./Keys' movement keys and a
// Mac's Cmd keys). ('riscos' replaced by a stand-in: no window is
// opened; the pane is checked in word-changes.mjs.)
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {EMPTY} from '../../tools/moreapps/!Letters/Pending';
import {on} from '../../tools/moreapps/!Letters/RevTrack';
import {keymap, ROWS, WINDOW}
  from '../../tools/moreapps/!Letters/Keymap';
import {command} from '../../tools/moreapps/!Letters/Keys';
import {CMD} from '../../tools/moreapps/!Letters/MacKeys';
import {buildDocx, documentXml, settingsXml} from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';

globalThis.__cmStub = {beeps: 0, msgs: []};
const STUB = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__cmStub;' +
  'export const Menu = class {constructor(t, i) {this.title = t;' +
  ' this.items = i;}};' +
  'export const wimp = {beep() { s.beeps++; }, menus: {},' +
  ' setCaret() {}, width: 2000};' +
  'export const reportError = (m) => { s.msgs.push(m); };' +
  'export const TextArea = class {}, vfs = {}, choices = {},' +
  ' textWidth = () => 0, saveAs = () => {}, query = () => {},' +
  ' infoBox = () => {}, os = {};');
registerHooks({resolve(spec, ctx, next) {
  if (spec === 'riscos') return {url: STUB, shortCircuit: true};
  return next(spec, ctx);
}});
const L = '../../tools/moreapps/!Letters/';
const {toolsMenu} = await import(L + 'ToolsMenu');
const CB = await import(L + 'ChangesBox');
const {docCommand} = await import(L + 'DocKeys');

const st = globalThis.__cmStub;
const D = '2024-01-02T03:04:00Z';
const sp = (t) => (/^ | $/.test(t) ? ' xml:space="preserve"' : '');
const run = (t, tag = 'w:t') => `<w:r><${tag}${sp(t)}>${t}</${tag}>` +
  '</w:r>';
const att = (id, au) => `w:id="${id}" w:author="${au}" w:date="${D}"`;
const ins = (id, t, au = 'Ann') => `<w:ins ${att(id, au)}>${run(t)}` +
  '</w:ins>';
const del = (id, t, au = 'Ann') => `<w:del ${att(id, au)}>` +
  `${run(t, 'w:delText')}</w:del>`;
const para = (inner) => `<w:p>${inner}</w:p>`;
const SETTINGS = '<w:zoom w:percent="100"/>';
const BODY = para(run('ab ') + ins(1, 'new') + run(' cd ') +
  del(2, 'old') + run(' ef'));

/** A fake window over a Document of the parts (no desktop). */
function fakeWin(d) {
  const v = {d, hdr: null, mac: false, pending: EMPTY, selRev: 0,
    formatListeners: [], typing: new Typing(d), _L: null,
    sel: S.caret({id: d.doc.sections[0].blocks[0].id, off: 0}),
    ensure() {}, edited(s) { this.sel = s; },
    setSelection(s) { this.sel = s; },
    refused(m) { st.beeps++; if (m) st.msgs.push(m); }};
  return {d, view: v, boxes: new Map(), app: {}, closed: false,
    get markup() { return d.markup; },
    setMarkup(m) {
      if (d.markup === m) return false;
      d.markup = m;
      return true;
    }};
}
async function win(body = BODY, settings = SETTINGS, more = {}) {
  const parts = {'word/document.xml': documentXml(body), ...more};
  if (settings !== null) parts['word/settings.xml'] =
    settingsXml(settings);
  return fakeWin(new Document(await readDocx(await buildDocx(parts))));
}
const val = (f, it) => (typeof f === 'function' ? f(it) : f);
const item = (m, text) => m.items.find((i) => i.text === text);
const P0 = (dw) => dw.d.doc.sections[0].blocks[0];
const caretAt = (dw, off) => {
  dw.view.sel = S.caret({id: P0(dw).id, off});
};
const CHANGE_ITEMS = ['Track Changes', 'Accept', 'Reject', 'Accept All',
  'Reject All', 'Previous Change', 'Next Change'];

describe('Tools menu: tracked changes', () => {
  it('lists the items in order, the keys shown', async () => {
    const dw = await win();
    const m = toolsMenu(dw);
    assert.deepEqual(m.items.map((i) => i.text), ['Show Comments',
      'Delete comments in selection', 'Track Changes', 'Show Markup',
      'Show Changes Pane', 'Accept', 'Reject', 'Accept All',
      'Reject All', 'Previous Change', 'Next Change',
      'User name and initials...', 'Spelling...',
      'Check spelling as you type']);
    assert.equal(item(m, 'Track Changes').key,
      keymap.labelFor('trackChanges'));
    assert.equal(keymap.labelFor('trackChanges'), 'Ctrl+Shift+E');
    assert.equal(item(m, 'Next Change').key, 'Alt+Shift+Down');
    assert.equal(item(m, 'Previous Change').key, 'Alt+Shift+Up');
    const sm = item(m, 'Show Markup').submenu();
    assert.deepEqual(sm.items.map((i) => i.text), ['All Markup',
      'Final', 'Original']);
    dw.view.mac = true;
    assert.equal(item(toolsMenu(dw), 'Track Changes').key,
      'Cmd+Shift+E');
  });

  it('Track Changes: ticked while on, one undo step, the tick after ' +
    'undo; refused with no settings part', async () => {
    const dw = await win();
    const tc = () => item(toolsMenu(dw), 'Track Changes');
    assert.equal(val(tc().ticked), false);
    assert.equal(val(tc().shaded), false);
    const n0 = dw.d.undoDepth;
    tc().action();
    assert.equal(on(dw.d), true);
    assert.equal(val(tc().ticked), true);
    assert.equal(dw.d.undoDepth, n0 + 1);
    dw.d.undo();
    assert.equal(val(tc().ticked), false, 'the tick follows undo');
    dw.d.redo();
    assert.equal(val(tc().ticked), true);
    assert.equal(docCommand(dw, 'trackChanges'), true);
    assert.equal(on(dw.d), false, 'Ctrl+Shift+E switches it off');
    const bare = await win(BODY, null);
    const t2 = item(toolsMenu(bare), 'Track Changes');
    assert.equal(val(t2.shaded), true);
    assert.match(val(t2.help), /no settings part/);
    const b0 = st.beeps, d0 = bare.d.undoDepth;
    assert.equal(CB.toggleTracking(bare), false);
    assert.equal(st.beeps, b0 + 1);
    assert.equal(bare.d.undoDepth, d0);
  });

  it('menu items are shaded in header, footer and note modes',
    async () => {
      const dw = await win(BODY, SETTINGS);
      const live = toolsMenu(dw);
      for (const t of ['Track Changes', 'Accept All', 'Reject All',
        'Next Change']) {
        assert.equal(val(item(live, t).shaded), false, t);
      }
      for (const kind of ['hdr', 'note']) {
        dw.view.hdr = {kind};
        const m = toolsMenu(dw);
        for (const t of CHANGE_ITEMS) {
          const it = item(m, t);
          assert.equal(val(it.shaded), true, kind + ' ' + t);
          assert.match(val(it.help), /Leave the header or footer/);
        }
        for (const t of ['Show Markup', 'Show Changes Pane',
          'Show Comments']) {
          assert.ok(!val(item(m, t).shaded), kind + ' ' + t);
        }
        const b0 = st.beeps, n0 = dw.d.undoDepth;
        assert.equal(CB.toggleTracking(dw), false);
        assert.equal(CB.accept(dw, true), false);
        assert.equal(CB.resolveAll(dw, true), null);
        assert.equal(CB.step(dw, 1), false);
        assert.equal(docCommand(dw, 'nextChange'), true);
        assert.equal(st.beeps, b0 + 5);
        assert.equal(dw.d.undoDepth, n0, 'nothing changed');
      }
    });

  it('Accept and Reject: shaded with no change at the caret (the ' +
    'reason as help), one undo step on one', async () => {
    const dw = await win();
    dw.d.markup = 'all';
    caretAt(dw, 0);
    const m0 = toolsMenu(dw);
    assert.equal(val(item(m0, 'Accept').shaded), true);
    assert.match(val(item(m0, 'Accept').help), /no tracked change/);
    caretAt(dw, 4);
    const m1 = toolsMenu(dw);
    assert.equal(val(item(m1, 'Reject').shaded), false);
    const n0 = dw.d.undoDepth;
    item(m1, 'Reject').action();
    assert.equal(P0(dw).text, 'ab  cd old ef');
    assert.equal(dw.d.undoDepth, n0 + 1);
    assert.ok(S.collapsed(dw.view.sel));
  });

  it('Accept All gives the notice; nothing left: shaded', async () => {
    const doc = await readDocx(await withHeaders(BODY,
      {default: para(ins(7, 'head'))}));
    const dw = fakeWin(new Document(doc));
    st.msgs.length = 0;
    const m = toolsMenu(dw);
    assert.equal(val(item(m, 'Accept All').shaded), false);
    item(m, 'Accept All').action();
    assert.equal(P0(dw).text, 'ab new cd  ef');
    assert.deepEqual(st.msgs, [CB.notice(2, 1, true)]);
    assert.equal(CB.notice(2, 1, true), '2 changes accepted (1 kept: ' +
      'in headers, footers or notes, or in links or fields).');
    assert.equal(CB.notice(1, 0, false), '1 change rejected.');
    const m2 = toolsMenu(dw);
    assert.equal(val(item(m2, 'Reject All').shaded), true);
    assert.match(val(item(m2, 'Reject All').help), /kept as it is/);
    const plain = await win(para(run('x')));
    assert.match(val(item(toolsMenu(plain), 'Accept All').help),
      /no tracked changes/);
  });

  it('Next and Previous Change follow the view; Show Markup ticks ' +
    'and sets it', async () => {
    const dw = await win();
    caretAt(dw, 0);
    const sm = () => item(toolsMenu(dw), 'Show Markup').submenu();
    assert.deepEqual(sm().items.map((i) => val(i.ticked)),
      [false, true, false], 'Final at first');
    // (Final: the deletion hidden, so Next passes over it)
    assert.equal(CB.step(dw, 1), true);
    const o = (s) => [s.anchor.off, s.head.off];
    assert.deepEqual(o(dw.view.sel), [3, 6]);
    assert.equal(val(item(toolsMenu(dw), 'Next Change').shaded), true);
    sm().items[0].action();
    assert.equal(dw.markup, 'all');
    assert.deepEqual(sm().items.map((i) => val(i.ticked)),
      [true, false, false]);
    assert.equal(docCommand(dw, 'nextChange'), true);
    assert.deepEqual(o(dw.view.sel), [10, 13]);
    assert.equal(docCommand(dw, 'prevChange'), true);
    assert.deepEqual(o(dw.view.sel), [3, 6]);
    const b0 = st.beeps;
    assert.equal(CB.step(dw, -1), false, 'no wrap');
    assert.equal(st.beeps, b0 + 1);
    sm().items[2].action();
    assert.equal(dw.markup, 'original');
  });
});

describe('Keymap: tracked-change keys', () => {
  const k = (key, mods, code) => keymap.lookup({code: 0, key, ...mods,
    domEvent: code ? {code} : undefined});
  it('Ctrl+Shift+E, Alt+Shift+Down and Up; the notes keep Alt+Down',
    () => {
      assert.equal(k('E', {ctrl: true, shift: true}), 'trackChanges');
      assert.equal(k('e', {ctrl: true, shift: true}), 'trackChanges');
      assert.equal(k('e', {ctrl: true}), 'alignCenter');
      assert.equal(k('ArrowDown', {alt: true, shift: true},
        'ArrowDown'),
        'nextChange');
      assert.equal(k('ArrowUp', {alt: true, shift: true}),
        'prevChange');
      assert.equal(k('ArrowDown', {alt: true}), 'nextNote');
      assert.equal(k('ArrowUp', {alt: true}), 'prevNote');
      assert.equal(k('ArrowDown', {shift: true}), null, 'a move: Keys');
      for (const id of ['trackChanges', 'nextChange', 'prevChange']) {
        assert.ok(WINDOW.has(id), id);
        assert.equal(keymap.row(id).menu, 'Window');
      }
      assert.equal(keymap.row('accept'), null, 'Accept has no key');
    });

  it('no two bindings collide (canonical names, Keys\' movement ' +
    'keys, a Mac\'s Cmd letters)', () => {
      const canon = (name) => {
        const m = /^((?:(?:Ctrl|Alt|Shift)\+)*)(.+)$/.exec(name);
        const mods = new Set(m[1].split('+').filter(Boolean));
        const key = m[2].length === 1 ? m[2].toUpperCase() : m[2];
        return ['Ctrl', 'Alt', 'Shift'].filter((x) => mods.has(x))
          .concat(key).join('+');
      };
      const seen = new Map();
      for (const r of ROWS) {
        for (const name of r.keys || []) {
          const c = canon(name);
          assert.ok(!seen.has(c),
            `${name}: ${seen.get(c)} and ${r.id}`);
          seen.set(c, r.id);
        }
      }
      // (each key of ours is looked up as itself: none is lost to an
      // earlier row or to ./Keys, which moves the caret)
      const ARROW = {Up: 'ArrowUp', Down: 'ArrowDown'};
      for (const [c, id] of seen) {
        const parts = c.split('+'), key = parts.pop();
        const mods = {ctrl: parts.includes('Ctrl'),
          alt: parts.includes('Alt'), shift: parts.includes('Shift')};
        const name = ARROW[key] || (key === 'Space' ? ' ' : key);
        if (!mods.alt && name.length > 1 && !/^F\d+$/.test(name)) {
          continue;                    // (Enter, Tab...: by their code)
        }
        const code = name.length === 1 ? name.charCodeAt(0) : 0;
        if (!mods.alt) {
          assert.equal(command(code, {...mods, key: name}), null, c);
        }
        if (/^[A-Z]$/.test(name) && mods.ctrl && !mods.alt) {
          // (Ctrl and a letter: the bare Ctrl-letter code too)
          assert.equal(keymap.lookup({code: name.charCodeAt(0) - 64,
            key: name, ...mods}), id, c);
        } else if (name.length === 1 || ARROW[key]) {
          assert.equal(keymap.lookup({code, key: name, ...mods}), id,
            c);
        }
      }
      // a Mac's Cmd+Shift+E is Ctrl+Shift+E (Word's there too)
      assert.ok(CMD.has('e'));
      assert.ok(!seen.has('Ctrl+Alt+C'), 'AltGr+C on some layouts');
      for (const c of seen.keys()) {
        assert.ok(!/^Ctrl\+Alt\+(Shift\+)?[A-Z]$/.test(c) ||
          ['Ctrl+Alt+F', 'Ctrl+Alt+D', 'Ctrl+Alt+M'].includes(c),
        'a new Ctrl+Alt letter: ' + c);
      }
    });
});

describe('Find: why a match is not replaced', () => {
  const REV = 'Text in a tracked change is kept: accept or reject it ' +
    'first.';
  const rawDel = '<w:del w:id="9" w:author="Bo" w:date="' + D + '">' +
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r>' +
    '<w:delInstrText> PAGE </w:delInstrText></w:r><w:r>' +
    '<w:fldChar w:fldCharType="separate"/></w:r>' +
    run('gone', 'w:delText') +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:del>';
  const link = '<w:hyperlink w:anchor="x">' + run('old link') +
    '</w:hyperlink>';
  const fld = '<w:fldSimple w:instr=" DATE ">' + run('old date') +
    '</w:fldSimple>';
  const at = (dw, k, a, z) => {
    const b = dw.d.doc.sections[0].blocks[k];
    dw.view.sel = S.select({id: b.id, off: a}, {id: b.id, off: z});
  };

  it('deleted text shown in All Markup, a deletion kept as read ' +
    '(one holding a field) in Final and in All, a link, a field: ' +
    'each says why', async () => {
    const {replaceStep, all} =
      await import('../../tools/moreapps/!Letters/FindSel');
    const dw = await win(BODY + para(run('xy ') + rawDel + run(' zw')) +
      para(link) + para(fld));
    dw.win = {isOpen: false};
    const P1 = dw.d.doc.sections[0].blocks[1];
    assert.equal(P1.inlines[3].node.name, 'w:del', 'kept as read');
    for (const view of ['final', 'all']) {
      dw.d.markup = view;
      const o = {matchCase: false, whole: false, view};
      at(dw, 1, 1, 6);
      const n0 = dw.d.undoDepth;
      const m = replaceStep(dw, 'y  z', o, 'NEW');
      assert.ok(m.startsWith(REV), view + ': ' + m);
      assert.equal(dw.d.undoDepth, n0, 'not replaced');
    }
    const o = {matchCase: false, whole: false, view: 'all'};
    at(dw, 0, 10, 13);
    assert.ok(replaceStep(dw, 'old', o, 'NEW').startsWith(REV),
      'deleted text in All Markup');
    at(dw, 2, 0, 1);
    assert.match(replaceStep(dw, 'old', o, 'NEW'),
      /^Link text is kept\./);
    at(dw, 3, 0, 1);
    assert.match(replaceStep(dw, 'old', o, 'NEW'),
      /^Text in a field, a picture or another object is kept\./);
    assert.equal(all(dw, 'old', o, 'NEW'), '0 replaced; 1 in links, ' +
      '1 in tracked changes, 1 in fields or objects not replaced');
  });
});

/** A stand-in for the desktop's window: icons by name, handlers. */
function fakeTask() {
  return {createWindow(def) {
    const icons = new Map(def.icons.map((i) => [i.name, {...i,
      bbox: {x0: i.x, y0: i.y, x1: i.x + i.w, y1: i.y + i.h},
      setText(t) { this.text = t; },
      setState(o) { Object.assign(this, o); }}]));
    const hs = new Map();
    return {title: def.title, isOpen: false, x: 0, y: 0, w: def.w,
      h: def.h,
      iconByName: (n) => icons.get(n), useCanvas() {},
      on(n, f) { hs.set(n, [...(hs.get(n) || []), f]); },
      emit: (n, e) => (hs.get(n) || []).forEach((f) => f(e)),
      open() { this.isOpen = true; }, close() { this.isOpen = false; },
      invalidate() {}, setTitle(t) { this.title = t; },
      workToScreen: (x, y) => ({x, y}), delete() {
        this.isOpen = false;
        (hs.get('deleted') || []).forEach((f) => f());
      }};
  }};
}

describe('the Changes pane: cost and its foot', () => {
  globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 0);
  globalThis.cancelAnimationFrame ??= (k) => clearTimeout(k);
  const big = async (n) => {
    let body = '';
    for (let k = 0; k < n; k++) {
      body += para(run('t ') + (k % 2 ? del(k, 'd' + k, 'Bo')
        : ins(k, 'i' + k)));
    }
    const dw = await win(body);
    dw.app = {task: fakeTask()};
    dw.win = {x: 0, y: 0, w: 900, h: 800, isOpen: true};
    return dw;
  };
  /** ms of fn, best of k runs. */
  const best = (fn, k = 5) => {
    let m = Infinity;
    for (let i = 0; i < k; i++) {
      const t0 = performance.now();
      fn();
      m = Math.min(m, performance.now() - t0);
    }
    return m;
  };
  /** The pane of dw open, a row chosen; the cost of a refresh and of
   *  100 caret moves (the listener the view calls once a frame). */
  const costs = (dw) => {
    const api = CB.changesBox(dw);
    api.select(api.rows[1].key);
    const onSel = dw.view.formatListeners[0];
    const p0 = dw.d.doc.sections[0].blocks[0];
    const refresh = best(() => api.refresh());
    const moves = best(() => {
      for (let k = 0; k < 100; k++) {
        dw.view.sel = S.caret({id: p0.id, off: k % 2});
        onSel(dw.view);
      }
    });
    return {api, refresh, moves};
  };

  it('a caret move costs the same with 10,000 changes as with 1,000 ' +
    '(load-robust ratio); the pane is deleted with its window',
  async () => {
    const small = costs(await big(1000));
    const d10 = await big(10000), large = costs(d10);
    assert.equal(large.api.rows.length, 10000);
    assert.ok(large.moves / Math.max(small.moves, 0.5) < 5,
      `moves ratio ${(large.moves / small.moves).toFixed(1)} ` +
      `(${small.moves.toFixed(2)} ms, ${large.moves.toFixed(2)} ms)`);
    assert.ok(large.refresh / Math.max(small.refresh, 0.5) < 40,
      `refresh ratio ${(large.refresh / small.refresh).toFixed(1)}`);
    if (process.env.WORD_PERF === '1') {
      assert.ok(large.refresh < 50, `refresh ${large.refresh} ms`);
      assert.ok(large.moves < 5, `100 moves ${large.moves} ms`);
    }
    d10.boxes.get('changes').delete();
    assert.ok(large.api.gone);
    assert.equal(d10.view.formatListeners.length, 0);
  });

  it('cuts on code points; a long refusal ends with ...', () => {
    const g = {measureText: (t) => ({width: Array.from(t).length})};
    const name = '\u{1F600}'.repeat(30);
    const got = CB.fit(g, name, 10);
    assert.ok(got.isWellFormed() && got.endsWith('...'), got);
    assert.equal(Array.from(got).length, 10);
    assert.equal(CB.fit(g, 'short', 10), 'short');
    const [a, b] = CB.lines2('word '.repeat(40));
    assert.ok(Array.from(a).length <= 60 && b.endsWith('...'));
    assert.ok(Array.from(b).length <= 60);
    assert.deepEqual(CB.lines2('one line'), ['one line', '']);
    const [c, e] = CB.lines2('\u{1F600}'.repeat(200));
    assert.ok(c.isWellFormed() && e.isWellFormed() &&
      e.endsWith('...'));
  });

  it('why reports a refusal as itself (only Refused is caught)',
    async () => {
      const dw = await win();
      dw.view.sel = S.caret({id: 'nope', off: 0});
      const w = CB.why(dw, 'accept');
      assert.equal(typeof w, 'string');
      dw.view.sel = {anchor: 5, head: 5};
      assert.equal(typeof CB.why(dw, 'reject'), 'string');
    });
});
