// The Print box and the hand-over to !Printers (Print batch, task 4):
// PrintOut's markup and css (a sheet per page, sized to the paper,
// the page image placed on it, @page margin 0, the title escaped);
// the box (window menu Print...): no printer driver -> an error box
// and no box; Pages All or From / To (a bad range refused with a
// beep and why); Fit to paper; the printer line; Print calls
// os.printers.print at once, inside the click (the output window
// opens in the user's gesture), with the pages still being made
// (a promise), the progress in the box; Cancel, the close icon or
// the window closing stops it and the promise is rejected with
// {cancelled: true} (!Printers closes its window, says nothing);
// a failure said in an error box, the box kept. ('riscos', the
// Dialog and os.printers replaced by stand-ins; no canvas in Node:
// an OffscreenCanvas stand-in records the pages made.)
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Emitter} from '../../src/core/util.js';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../..');

// ------------------------------------------------------- stand-ins

const s = globalThis.__prStub = {notes: [], beeps: 0, dialogs: [],
  onMsg: null, os: {printers: null}, canvases: []};

/** Ui/Dialog: one box per task and key; press as a bottom button. */
const reg = new Map();
s.dialog = (o) => {
  const old = reg.get(o.key);
  if (old && !old.gone) return old;
  const vals = new Map(), shaded = new Set();
  const h = {button: [], change: [], close: []};
  const win = new Emitter();
  let closed = true;
  const emit = (t, ev) => {
    let keep = false;
    for (const fn of h[t].slice()) if (fn(ev) === false) keep = true;
    return keep;
  };
  const ended = () => {
    if (closed) return;
    closed = true;
    emit('close', {});
  };
  const api = {opts: o, win, gone: false, focused: null, opens: 0,
    get isOpen() { return win.isOpen; },
    get: (n) => vals.get(n), shaded: (n) => shaded.has(n),
    set(n, v) {
      vals.set(n, v);
      if (n === 'msg' && s.onMsg) s.onMsg(v, api);
    },
    shade(n, on) { if (on) shaded.add(n); else shaded.delete(n); },
    focus(n) { api.focused = n; },
    values: () => Object.fromEntries(vals),
    on(t, fn) { h[t].push(fn); },
    open() { win.isOpen = true; closed = false; api.opens++; },
    close() { win.isOpen = false; ended(); },
    delete() {
      if (api.gone) return;
      api.gone = true;
      win.isOpen = false;
      ended();
      reg.delete(o.key);
      win.emit('deleted');
    },
    /** A bottom button (the box deleted unless kept). */
    press(name) {
      if (shaded.has(name) || api.gone) return;
      if (!emit('button', {name, values: api.values()})) api.delete();
    },
    /** The user changes a control. */
    change(n, v) {
      vals.set(n, v);
      emit('change', {name: n, value: v});
    }};
  win.isOpen = false;
  win.delete = () => api.delete();
  win.bringToFront = () => {};
  for (const c of o.rows.flat()) {
    if ('value' in c && c.kind !== 'radio') vals.set(c.name, c.value);
    if (c.kind === 'label' && c.name) vals.set(c.name, c.text);
  }
  reg.set(o.key, api);
  s.dialogs.push(api);
  return api;
};

/** Every name a module under tools/moreapps imports from 'riscos'
 *  (as ./pdfbox.test.mjs finds them). */
function riscosNames() {
  const names = new Set();
  const dir = path.join(ROOT, 'tools/moreapps');
  for (const e of fs.readdirSync(dir, {recursive: true,
    withFileTypes: true})) {
    if (!e.isFile() || e.name.endsWith('.png')) continue;
    const src = fs.readFileSync(path.join(e.parentPath, e.name),
      'latin1');
    for (const m of src.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*'riscos'/g)) {
      for (const n of m[1].split(',')) {
        const k = n.trim().split(/\s+as\s+/)[0];
        if (k) names.add(k);
      }
    }
  }
  return names;
}
const OWN = new Set(['Menu', 'wimp', 'reportError', 'os']);
const RISCOS = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__prStub;' +
  'export class Menu {constructor(t, i) {this.title = t;' +
  ' this.items = i;}}' +
  'export const wimp = {beep() { s.beeps++; }, menus: {close() {}},' +
  ' setCaret() {}, width: 2000, height: 1600};' +
  'export const reportError = (m, o) => { s.notes.push({m, o}); };' +
  'export const os = s.os;' +
  [...riscosNames()].filter((n) => !OWN.has(n))
    .map((n) => `export const ${n} = new Proxy(function () {}, ` +
      '{get: () => () => {}, apply: () => undefined});').join(''));
const DIALOG = 'data:text/javascript,' + encodeURIComponent(
  'export const dialog = (o) => globalThis.__prStub.dialog(o);');
registerHooks({resolve(spec, ctx, next) {
  if (spec === 'riscos') return {url: RISCOS, shortCircuit: true};
  if (spec === 'wimplib/Ui/Dialog') {
    return {url: DIALOG, shortCircuit: true};
  }
  return next(spec, ctx);
}});

/** An OffscreenCanvas that draws nothing: its JPEG is 'x'. */
globalThis.OffscreenCanvas = class {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    s.canvases.push(this);
  }
  getContext() {
    let m = [1, 0, 0, 1, 0, 0];
    const fns = {
      setTransform: (a, b, c, d, e, f) => { m = [a, b, c, d, e, f]; },
      scale: (x, y) => { m = [m[0] * x, m[1] * x, m[2] * y,
        m[3] * y, m[4], m[5]]; },
      getTransform: () => ({a: m[0], b: m[1], c: m[2], d: m[3],
        e: m[4], f: m[5]}),
      measureText: (t) => ({width: String(t).length * 6,
        actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2}),
      getLineDash: () => [],
    };
    return new Proxy({}, {
      get: (t, k) => (k in fns ? fns[k] : k in t ? t[k]
        : k === 'link' || typeof k === 'symbol' ? undefined
          : () => {}),
      set: (t, k, v) => { t[k] = v; return true; },
    });
  }
  async convertToBlob() { return new Blob(['x']); }
};

const L = '../../tools/moreapps/!Letters/';
const {printBox, NO_PRINTER, RUNNING} = await import(L + 'PrintBox');
const {printHtml, markupOf, cssOf} = await import(L + 'PrintOut');
const {windowMenu} = await import(L + 'WinMenu');
const {docCommand} = await import(L + 'DocKeys');
const {keymap} = await import(L + 'Keymap');
const {keyFor} = await import(L + 'EditKeys');
const {macKey, macLabel} = await import(L + 'MacKeys');

before(loadStyles);

// ---------------------------------------------------------- fixtures

const A4 = {name: 'A4', width: 209.90277777777777,
  height: 297.0388888888889};
const LETTER = {name: 'Letter paper size', width: 215.9,
  height: 279.4};

/** os.printers with one printer; print() records each call and
 *  settles as !Printers does (the html awaited; a rejection: false). */
function printers(o = {}) {
  const calls = [];
  const cur = {name: o.name || 'Laser', type: 'PostScript',
    class: 'PS', connection: 'Parallel', paper: o.paper || A4,
    landscape: !!o.landscape};
  const api = {calls,
    get current() { return api.off ? null : {...cur,
      paper: {...cur.paper}}; },
    print(doc) {
      const c = {doc, html: undefined, rejected: undefined};
      calls.push(c);
      c.done = Promise.resolve(doc.html).then((h) => {
        c.html = h;
        return true;
      }, (e) => {
        c.rejected = e;
        return false;
      });
      return c.done;
    }};
  return api;
}

/** A window over Document d, in Print layout (its pages done). */
function windowOf(d, o = {}) {
  const L = new DocLayout(d.doc, tm(), null, {floats: true,
    markup: 'final', pics: {get: () => ({state: 'pending'})}});
  L.layout(800);
  const pages = new Pages(printGalley(L));
  L.place = PlacePrint(L, pages);
  L.layout(800);
  pages.finish();
  d.markup = 'final';
  const app = {task: {name: 'Letters'}, dir: 'F', docs: new Map(),
    keyOf: (p) => String(p).toLowerCase(), recent: []};
  const dw = {d, doc: d.doc, L, pages, viewName: 'print', app,
    boxes: new Map(), docKey: 'doc' + (++windowOf.n), closed: false,
    path: 'ADFS::HardDisc4.$.Report/docx',
    leaf: o.leaf || 'Report/docx', get markup() { return d.markup; },
    fields: {now: new Date(Date.UTC(2026, 0, 1))},
    view: {d, hdr: null, mac: false, focus() {}}};
  return dw;
}
windowOf.n = 0;

const pagesDoc = (texts) => mk(texts.map((t, i) => (i
  ? [t, {pPr: {pageBreakBefore: true}}] : t)));
const THREE = ['one', 'two', 'three'];
const reset = (o) => {
  s.notes = [];
  s.beeps = 0;
  s.onMsg = null;
  s.canvases = [];
  s.os.printers = o === null ? null : printers(o);
  return s.os.printers;
};
const sheets = (html) => html.split('<div class="lsheet"').length - 1;
const imgs = (html) => [...html.matchAll(
  /left:([-\d.]+)mm;top:([-\d.]+)mm;width:([\d.]+)mm;height:([\d.]+)mm/g)]
  .map((m) => m.slice(1).map(Number));

/** The box's run (the print call's html) settled. */
async function settled(c) {
  await c.done;
  await new Promise((res) => setTimeout(res, 0));
}

// -------------------------------------------------------------- tests

describe('PrintOut: the markup and css handed to !Printers', () => {
  it('a sheet per page, the paper size to 0.1 mm, @page margin 0',
    () => {
      const css = cssOf({w: 209.9, h: 297});
      assert.ok(css.includes('@page{size:209.9mm 297.0mm;margin:0}'),
        css);
      assert.ok(css.includes('.lsheet{position:relative;' +
        'width:209.9mm;height:297.0mm;overflow:hidden;' +
        'break-after:page}'), css);
      assert.ok(css.includes('image-rendering:auto'), css);
      assert.ok(!css.includes('.pic'), 'not !Printers\' img.pic');
      const html = markupOf('Report', [
        {url: 'data:image/jpeg;base64,AAA', x: 0, y: 0, w: 209.9,
          h: 297},
        {url: 'data:image/jpeg;base64,BBB', x: -2.5, y: 10.25,
          w: 215.9, h: 279.4}]);
      assert.equal(sheets(html), 2);
      assert.deepEqual(imgs(html), [[0, 0, 209.9, 297],
        [-2.5, 10.25, 215.9, 279.4]]);
      assert.ok(html.includes('src="data:image/jpeg;base64,BBB"'));
      assert.ok(html.includes('alt="Report, page 2"'));
    });
  it('the title is escaped where it appears', () => {
    const html = markupOf('<A & "B">', [{url: 'data:,', x: 0, y: 0,
      w: 1, h: 1}]);
    assert.ok(html.includes('alt="&lt;A &amp; &quot;B&quot;&gt;, ' +
      'page 1"'), html);
    assert.ok(!html.includes('<A'), html);
  });
  it('the data URLs as they are; a src with a quote still escaped ' +
    '(final fixes)', () => {
    const big = 'data:image/jpeg;base64,' + 'A/+9'.repeat(30000);
    const html = markupOf('<T>', [{url: big, x: 0, y: 0, w: 1, h: 1},
      {url: 'x" onerror="y&z', x: 0, y: 0, w: 1, h: 1}]);
    assert.ok(html.includes(`src="${big}"`));
    assert.ok(html.includes('src="x&quot; onerror=&quot;y&amp;z"'),
      html.slice(-120));
    assert.ok(html.includes('alt="&lt;T&gt;, page 2"'));
  });
  it('printHtml: print() called at once with the pages a promise',
    async () => {
      const P = printers();
      let done;
      const pages = new Promise((res) => { done = res; });
      const r = printHtml(P, {title: 'T & U', pages,
        paper: {w: 215.9, h: 279.4}});
      assert.equal(P.calls.length, 1, 'called before the pages');
      const {doc} = P.calls[0];
      assert.equal(doc.title, 'T & U');
      assert.ok(doc.html instanceof Promise);
      assert.match(doc.css, /@page\{size:215\.9mm 279\.4mm;margin:0\}/);
      done({pages: [{url: 'data:,', x: 0, y: 0, w: 1, h: 1}],
        count: 1});
      assert.equal(await r, true);
      assert.equal(sheets(P.calls[0].html), 1);
    });
  it('printHtml: stopped (null) or failed: rejected {cancelled: true}',
    async () => {
      for (const pages of [Promise.resolve(null),
        Promise.reject(new Error('boom'))]) {
        const P = printers();
        assert.equal(await printHtml(P, {title: 't', pages,
          paper: {w: 210, h: 297}}), false);
        assert.equal(P.calls[0].rejected.cancelled, true);
      }
    });
});

describe('the Print box', () => {
  it('defaults: All, Fit to paper on, the printer line', () => {
    reset();
    const dw = windowOf(pagesDoc(THREE));
    const api = printBox(dw);
    assert.ok(api.isOpen);
    assert.equal(api.opts.title, 'Print');
    assert.equal(api.opts.key, `print:${dw.docKey}`);
    assert.deepEqual(api.opts.buttons, ['Cancel', 'Print']);
    assert.equal(api.opts.enter, 'Print');
    assert.equal(dw.boxes.get('print'), api.win);
    assert.equal(api.get('pages'), 'all');
    assert.equal(api.get('fit'), true);
    assert.ok(api.opts.rows.flat().some((c) => c.kind === 'option' &&
      c.name === 'fit' && c.text === 'Fit to paper'));
    assert.equal(api.get('printer'), 'Printer: Laser, A4 portrait');
    assert.equal(api.get('markup'), 'Markup: final text');
    assert.ok(api.shaded('from') && api.shaded('to'));
    assert.equal(printBox(dw), api, 'one box per document');
    api.press('Cancel');
    assert.ok(api.gone);
  });
  it('the printer line: " paper size" dropped, landscape; read ' +
    'again each time the box opens', () => {
    const P = reset({name: 'Jet', paper: LETTER, landscape: true});
    const dw = windowOf(pagesDoc(['a']));
    const api = printBox(dw);
    assert.equal(api.get('printer'), 'Printer: Jet, Letter landscape');
    api.press('Cancel');
    s.os.printers = printers({name: 'Other', paper: A4});
    const again = printBox(dw);
    assert.equal(again.get('printer'), 'Printer: Other, A4 portrait');
    again.press('Cancel');
    assert.ok(P);
  });
  it('no printer driver: an error box, no Print box', () => {
    for (const off of ['none', 'nocurrent']) {
      const P = reset(off === 'none' ? null : undefined);
      if (P) P.off = true;
      const n = s.dialogs.length;
      const dw = windowOf(pagesDoc(['a']));
      assert.equal(printBox(dw), null);
      assert.equal(s.dialogs.length, n, 'no box made');
      assert.deepEqual(s.notes.map((x) => x.m), [NO_PRINTER]);
      assert.match(NO_PRINTER, /no printer driver/i);
      assert.match(NO_PRINTER, /!Printers/);
      assert.match(NO_PRINTER, /double-click/);
      assert.ok(!dw.boxes.has('print'));
    }
  });
  it('a bad range: a beep and why, nothing printed', () => {
    const P = reset();
    const dw = windowOf(pagesDoc(THREE));
    const api = printBox(dw);
    api.change('from', 3);
    api.change('to', 2);
    assert.equal(api.get('pages'), 'range', 'typing picks From');
    api.press('Print');
    assert.equal(s.beeps, 1);
    assert.equal(api.get('msg'), 'From is after To: no pages to print.');
    assert.equal(P.calls.length, 0);
    assert.ok(api.isOpen);
    api.press('Cancel');
  });
  it('Print: print() once inside the click, the title, @page, the ' +
    'range\'s pages; progress; the box closed', async () => {
    const P = reset();
    const d = pagesDoc(THREE);
    const dw = windowOf(d, {leaf: 'Notes & <b>'});
    const depth = d.undoDepth, dirty = d.dirty, doc = d.doc;
    const api = printBox(dw);
    api.change('from', 2);
    api.change('to', 3);
    const seen = [], busy = [];
    s.onMsg = (t, a) => {
      seen.push(t);
      if (t) busy.push(['Print', 'from', 'to', 'all', 'range', 'fit']
        .every((n) => a.shaded(n)));
    };
    api.press('Print');
    assert.equal(P.calls.length, 1, 'called inside the click');
    const {doc: job} = P.calls[0];
    assert.equal(job.title, 'Notes & <b>');
    assert.ok(job.css.includes('@page{size:209.9mm 297.0mm;margin:0}'));
    assert.ok(job.html instanceof Promise);
    await settled(P.calls[0]);
    assert.equal(P.calls[0].rejected, undefined);
    assert.equal(sheets(P.calls[0].html), 2);
    assert.ok(P.calls[0].html.includes('alt="Notes &amp; &lt;b&gt;, ' +
      'page 1"'));
    assert.deepEqual(seen.filter((t) => t), ['Preparing pages...',
      'Page 1 of 2', 'Page 2 of 2']);
    assert.ok(busy.slice(0, 3).every(Boolean), 'shaded while busy');
    assert.ok(api.gone, 'the box closed');
    assert.deepEqual(s.notes, []);
    assert.equal(d.undoDepth, depth);
    assert.equal(d.dirty, dirty);
    assert.equal(d.doc, doc);
  });
  it('Fit to paper off: the page at its own size on the paper',
    async () => {
      const boxes = {};
      for (const fit of [true, false]) {
        const P = reset({paper: LETTER});
        const api = printBox(windowOf(pagesDoc(['a'])));
        api.change('fit', fit);
        api.press('Print');
        await settled(P.calls[0]);
        boxes[fit] = imgs(P.calls[0].html)[0];
      }
      const [, yOn, wOn, hOn] = boxes.true;
      const [, yOff, wOff, hOff] = boxes.false;
      assert.ok(Math.abs(hOn - 279.4) < 0.01, 'fit: the paper height');
      assert.ok(Math.abs(yOn) < 0.01);
      assert.ok(Math.abs(hOff - 297) < 0.5, 'own size: A4 ' + hOff);
      assert.ok(yOff < 0, 'cut at top and bottom');
      assert.ok(wOff > wOn);
    });
  it('Cancel while the pages are made: stopped, rejected ' +
    '{cancelled: true}, the box gone, nothing said', async () => {
    const P = reset();
    const dw = windowOf(pagesDoc(THREE));
    const api = printBox(dw);
    s.onMsg = (t, a) => { if (t === 'Page 2 of 3') a.press('Cancel'); };
    api.press('Print');
    await settled(P.calls[0]);
    await new Promise((res) => setTimeout(res, 300));
    assert.equal(P.calls[0].rejected.cancelled, true);
    assert.ok(s.canvases.length < 3, 'no more pages painted');
    assert.ok(api.gone);
    assert.ok(!dw.boxes.has('print'));
    assert.deepEqual(s.notes, []);
  });
  it('a running print refuses a second Print', async () => {
    const P = reset();
    const api = printBox(windowOf(pagesDoc(THREE)));
    let tried = false;
    s.onMsg = (t, a) => {
      if (t !== 'Page 1 of 3' || tried) return;
      tried = true;
      assert.ok(a.shaded('Print'));
      a.shade('Print', false);         // (as Return may still press it)
      a.press('Print');
    };
    api.press('Print');
    assert.equal(P.calls.length, 1);
    await settled(P.calls[0]);
    assert.ok(tried);
    assert.equal(P.calls.length, 1, 'the second refused');
    assert.ok(P.calls[0].html);
  });
  it('the RUNNING message is said for the refused Print', () => {
    assert.match(RUNNING, /Cancel/);
  });
  it('the window closing while the pages are made: stopped, ' +
    'nothing said, no box left', async () => {
    const P = reset();
    const dw = windowOf(pagesDoc(THREE));
    const api = printBox(dw);
    s.onMsg = (t) => {
      if (t === 'Page 2 of 3') {
        dw.closed = true;
        for (const x of [...dw.boxes.values()]) x.delete();
      }
    };
    api.press('Print');
    await settled(P.calls[0]);
    assert.equal(P.calls[0].rejected.cancelled, true);
    assert.ok(api.gone);
    assert.equal(dw.boxes.size, 0);
    assert.deepEqual(s.notes, []);
  });
  it('the printer gone between the box opening and Print: the ' +
    'error box, nothing printed, the box kept', () => {
    const P = reset();
    const api = printBox(windowOf(pagesDoc(['a'])));
    s.os.printers = null;
    api.press('Print');
    assert.deepEqual(s.notes.map((x) => x.m), [NO_PRINTER]);
    assert.equal(P.calls.length, 0);
    assert.ok(api.isOpen);
    P.off = true;
    s.os.printers = P;
    s.notes = [];
    api.press('Print');
    assert.deepEqual(s.notes.map((x) => x.m), [NO_PRINTER]);
    assert.equal(P.calls.length, 0);
    api.press('Cancel');
  });
  it('a failure: said in an error box (once), the box kept and ' +
    'usable', async () => {
    const P = reset();
    const dw = windowOf(pagesDoc(THREE));
    dw.viewName = 'web';               // (no count: To unclamped)
    const api = printBox(dw);
    api.change('from', 5);
    api.change('to', 9);
    api.press('Print');
    await settled(P.calls[0]);
    await new Promise((res) => setTimeout(res, 0));
    assert.equal(P.calls[0].rejected.cancelled, true,
      '!Printers says nothing (its window closed)');
    assert.deepEqual(s.notes.map((x) => x.m), ['No pages to print.']);
    assert.ok(api.isOpen && !api.gone);
    assert.equal(api.shaded('Print'), false);
    s.notes = [];
    api.change('from', 2);
    api.press('Print');
    await settled(P.calls[1]);
    assert.equal(sheets(P.calls[1].html), 2);
    assert.deepEqual(s.notes, []);
  });
});

describe('the Print box: !Printers refusing (review fixes)', () => {
  it('print() throwing: said, the box kept and usable at once',
    async () => {
      const P = reset();
      const real = P.print;
      P.print = () => { throw new Error('No output window'); };
      const api = printBox(windowOf(pagesDoc(THREE)));
      api.press('Print');
      assert.deepEqual(s.notes.map((x) => x.m), ['No output window']);
      assert.ok(api.isOpen && !api.gone);
      assert.equal(api.shaded('Print'), false, 'not busy');
      assert.equal(api.shaded('fit'), false);
      P.print = real;
      s.notes = [];
      api.press('Print');
      assert.equal(P.calls.length, 1, 'Print taken at once');
      await settled(P.calls[0]);
      assert.equal(sheets(P.calls[0].html), 3);
      await new Promise((res) => setTimeout(res, 300));
      assert.deepEqual(s.notes, []);
    });
  it('print() answering false (!Printers said why): the pages ' +
    'stopped, the box kept, nothing more said', async () => {
    const P = reset();
    let asked = 0;
    P.print = () => { asked++; return Promise.resolve(false); };
    const dw = windowOf(pagesDoc(THREE));
    const api = printBox(dw);
    api.press('Print');
    assert.equal(asked, 1);
    await new Promise((res) => setTimeout(res, 400));
    assert.ok(s.canvases.length < 3, 'stopped: ' + s.canvases.length);
    assert.ok(api.isOpen && !api.gone, 'the box kept');
    assert.equal(api.shaded('Print'), false);
    assert.equal(api.get('msg'), '');
    assert.deepEqual(s.notes, []);
    api.press('Cancel');
  });
  it('the box closed while the pages are made, opened again and ' +
    'Print at once: not refused', async () => {
    const P = reset();
    const dw = windowOf(pagesDoc(THREE));
    const api = printBox(dw);
    let again = null;
    s.onMsg = (t, a) => {
      if (t !== 'Page 1 of 3' || again) return;
      a.close();
      again = printBox(dw);
      again.press('Print');
    };
    api.press('Print');
    await settled(P.calls[0]);
    assert.equal(again, api, 'the same box, shown again');
    assert.equal(P.calls[0].rejected.cancelled, true);
    assert.equal(P.calls.length, 2, 'Print not refused');
    assert.notEqual(again.get('msg'), RUNNING);
    s.onMsg = null;
    await settled(P.calls[1]);
    assert.equal(sheets(P.calls[1].html), 3);
    assert.ok(again.gone);
  });
});

describe('the Print box again (the boxes\' lifetime)', () => {
  it('Print after Cancel, after Cancel while running, after a ' +
    'Print', async () => {
    const P = reset();
    const dw = windowOf(pagesDoc(THREE));
    printBox(dw).press('Cancel');
    const a = printBox(dw);
    s.onMsg = (t, x) => { if (t === 'Page 2 of 3') x.press('Cancel'); };
    a.press('Print');
    await settled(P.calls[0]);
    assert.equal(P.calls[0].rejected.cancelled, true);
    s.onMsg = null;
    const b = printBox(dw);
    assert.notEqual(b, a);
    assert.equal(b.get('fit'), true);
    b.press('Print');
    await settled(P.calls[1]);
    assert.equal(sheets(P.calls[1].html), 3);
    assert.ok(b.gone);
    const c = printBox(dw);
    assert.ok(c.isOpen && c !== b);
    c.change('to', 1);
    c.press('Print');
    await settled(P.calls[2]);
    assert.equal(sheets(P.calls[2].html), 1);
    assert.deepEqual(s.notes, []);
  });
  it('two windows: two boxes, each printing its own', async () => {
    const P = reset();
    const one = windowOf(pagesDoc(['a']), {leaf: 'One'});
    const two = windowOf(pagesDoc(['a', 'b']), {leaf: 'Two'});
    const a = printBox(one), b = printBox(two);
    assert.notEqual(a, b);
    a.press('Print');
    b.press('Print');
    assert.equal(P.calls.length, 2);
    await Promise.all(P.calls.map(settled));
    const by = Object.fromEntries(P.calls.map((c) => [c.doc.title,
      sheets(c.html)]));
    assert.deepEqual(by, {One: 1, Two: 2});
    assert.ok(a.gone && b.gone);
  });
});

describe('Print...: the window menu, Ctrl+P, closing (task 5)', () => {
  const fileItems = (dw) => windowMenu(dw).items.map((i) => i.text);
  it('the File group: Print... right after Export as PDF...', () => {
    reset();
    const dw = windowOf(pagesDoc(['a']));
    dw.win = {isOpen: true};
    const t = fileItems(dw);
    assert.equal(t.indexOf('Print...'), t.indexOf('Export as PDF...') + 1,
      t.join());
    assert.equal(t.indexOf('Info'), t.indexOf('Print...') + 1);
  });
  it('the item shows the key, has help, and its action opens the box',
    () => {
      reset();
      const dw = windowOf(pagesDoc(['a']));
      dw.win = {isOpen: true};
      const item = windowMenu(dw).items.find((i) => i.text === 'Print...');
      assert.equal(item.key, 'Ctrl+P');
      assert.ok(item.help && /print/i.test(item.help));
      item.action();
      const api = s.dialogs[s.dialogs.length - 1];
      assert.ok(api.isOpen && dw.boxes.get('print') === api.win);
      assert.equal(api.opts.title, 'Print');
      api.press('Cancel');
    });
  it('Ctrl+P is bound to print (Cmd+P on a Mac, labelled Cmd+P)', () => {
    assert.equal(keymap.lookup({code: 16, key: 'p', ctrl: true}), 'print');
    const cmd = {code: 112, key: 'p', ctrl: false, alt: false,
      shift: false, domEvent: {metaKey: true, ctrlKey: false,
        shiftKey: false, altKey: false, key: 'p'}};
    assert.equal(keymap.lookup(macKey(cmd, true)), 'print');
    assert.equal(macLabel(keymap.labelFor('print'), true), 'Cmd+P');
    assert.equal(macLabel(keymap.labelFor('print'), false), 'Ctrl+P');
  });
  it('the key (docCommand print) opens the box and is used', () => {
    reset();
    const dw = windowOf(pagesDoc(['a']));
    assert.equal(docCommand(dw, 'print'), true);
    const api = s.dialogs[s.dialogs.length - 1];
    assert.ok(api.isOpen && dw.boxes.get('print') === api.win);
    api.press('Cancel');
  });
  it('the key with no printer: the error box, no Print box', () => {
    reset(null);
    const dw = windowOf(pagesDoc(['a']));
    assert.equal(docCommand(dw, 'print'), true);
    assert.deepEqual(s.notes.map((x) => x.m), [NO_PRINTER]);
    assert.equal(dw.boxes.get('print'), undefined);
  });
  it('a held Ctrl+P: once per press, repeats used up', () => {
    const key = (repeat) => ({code: 16, key: 'p', ctrl: true,
      alt: false, shift: false, domEvent: {repeat}});
    for (const none of [true, false]) {
      reset(none ? null : {});
      const dw = windowOf(pagesDoc(['a']));
      const v = {mac: false, d: dw.d, run: (id) => docCommand(dw, id)};
      assert.equal(keyFor(v, key(false)), true);
      for (let i = 0; i < 3; i++) assert.equal(keyFor(v, key(true)), true);
      if (none) {
        assert.deepEqual(s.notes.map((x) => x.m), [NO_PRINTER]);
        assert.equal(dw.boxes.get('print'), undefined);
      } else {
        assert.deepEqual(s.notes, []);
        const api = s.dialogs[s.dialogs.length - 1];
        assert.equal(api.opens, 1);
        api.press('Cancel');
      }
    }
  });
  it('closing the document deletes its Print box', () => {
    reset();
    const dw = windowOf(pagesDoc(['a']));
    const api = printBox(dw);
    assert.ok(api.isOpen && dw.boxes.get('print'));
    for (const b of [...dw.boxes.values()]) b.delete();   // CloseDoc
    assert.ok(api.gone);
    assert.equal(dw.boxes.size, 0);
  });
});
