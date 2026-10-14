// !Letters' layout extras against hostile input in the real desktop
// (Batch D P14.1, D37): newspaper columns, line numbers, floating
// pictures and tables with text wrapped round them, and the Web
// layout and Outline views. Each document opens in Print layout and
// its pages, column passes and wrap passes all finish (no error, no
// error box, no hang): 45 columns (and w:num 46 and 1e9, not read),
// 1,000 column breaks, w:lnNumType countBy, start and distance 1e9,
// 500 floating pictures on one page, a wrap polygon of 4,096 points
// (the cap) and of 10,000 (past it: not read), anchors with absurd
// offsets, 200 floating tables on one page with tblOverlap never,
// floating tables at tblpX / tblpY 1e9 and -1e9 and with no
// attributes, a floating table nested in a floating table's cell.
// For each: every page and every float on it finite, the window's
// extent holds the last page, a character typed at the end and
// undone. Outline: 10,000 paragraphs under nine levels of headings,
// every heading collapsed, then expanded, then Show level 1..9 and
// All, each under a budget. Web layout: the window resized 100 times
// (each throttled step finite, the last width laid out). Then 300
// seeded random actions across Print layout, Web layout, Outline and
// Draft (typing, Enter, Delete, Backspace, column and page breaks,
// caret moves, Wrap text kinds on a picture, Outline promote and
// demote, collapse sets, zoom, window sizes, views, undo, redo,
// scrolling): after each the selection is valid and nothing is
// reported; undoing everything gives back the opened model. No page
// errors.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r, REL } from './build-docx.mjs';
import { drawingXml, URIS, pngBytes } from './pic-fixtures.mjs';
import { rng } from './word-docs.mjs';

const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
const words = (i, n = 12) => Array.from({ length: n }, (_, j) => WORDS[(i + j) % 10]).join(' ');
const TEXT = (n, k = 0, m = 12) => Array.from({ length: n }, (_, i) => p(r(`${i + k} ` + words(i + k, m)))).join('');
const PG = '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" '
  + 'w:header="720" w:footer="720" w:gutter="0"/>';
const SECT = (more = '', type = '') => `<w:sectPr>${type ? `<w:type w:val="${type}"/>` : ''}${PG}${more}</w:sectPr>`;
const COLBR = '<w:r><w:br w:type="column"/></w:r>';
const ROOT = ` xmlns:wp="${URIS.wp}" xmlns:a="${URIS.a}" xmlns:pic="${URIS.pic}"`;
const EMU = 9525;
const docx = (body) => buildDocx({ 'word/document.xml': documentXml(body, { rootAttrs: ROOT }),
  'word/media/image1.png': pngBytes(4, 2) }, { docRels: [['rId11', REL('image'), 'media/image1.png']] });

/** A run holding a floating picture: positionH / V inner XML, wrap element. */
const anchor = ({ id = 1, w = 96, h = 48, ph = '<wp:posOffset>0</wp:posOffset>', pv = '<wp:posOffset>0</wp:posOffset>',
  hFrom = 'column', vFrom = 'paragraph', wrap = '<wp:wrapSquare wrapText="bothSides"/>' } = {}) => {
  let s = drawingXml({ kind: 'anchor', cx: Math.round(w * EMU), cy: Math.round(h * EMU), id, embed: 'rId11', decl: false });
  s = s.replace(/<wp:positionH[^]*<\/wp:positionV>/, `<wp:positionH relativeFrom="${hFrom}">${ph}</wp:positionH>`
    + `<wp:positionV relativeFrom="${vFrom}">${pv}</wp:positionV>`).replace('<wp:wrapSquare wrapText="bothSides"/>', wrap);
  return `<w:r>${s}</w:r>`;
};
const off = (v) => `<wp:posOffset>${v}</wp:posOffset>`;
const poly = (n) => '<wp:wrapTight wrapText="bothSides"><wp:wrapPolygon edited="0"><wp:start x="0" y="0"/>'
  + Array.from({ length: n - 1 }, (_, i) => `<wp:lineTo x="${Math.round(10800 + 10800 * Math.cos(i / n * 6.283))}" `
    + `y="${Math.round(10800 + 10800 * Math.sin(i / n * 6.283))}"/>`).join('') + '</wp:wrapPolygon></wp:wrapTight>';
/** A floating table: tblpPr attributes, rows, width (twips), tblOverlap, cell content. */
const ftbl = (a, { n = 2, w = 2000, never = false, cell } = {}) => '<w:tbl><w:tblPr><w:tblpPr'
  + Object.entries(a).map(([k, v]) => ` w:${k}="${v}"`).join('') + '/>'
  + (never ? '<w:tblOverlap w:val="never"/>' : '') + `<w:tblW w:w="${w}" w:type="dxa"/></w:tblPr>`
  + `<w:tblGrid><w:gridCol w:w="${w}"/></w:tblGrid>` + Array.from({ length: n }, (_, k) => `<w:tr><w:tc><w:tcPr>`
    + `<w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${cell ? cell(k) : p(r('cell ' + k))}</w:tc></w:tr>`).join('') + '</w:tbl>';
const H = (n, t) => p(r(t), `<w:outlineLvl w:val="${n}"/>`);

const HOSTILE = {
  Cols45: { body: TEXT(300) + SECT('<w:cols w:num="45" w:space="0"/>'), what: '45 columns (no spacing)' },
  Cols46: { body: TEXT(100) + SECT('<w:cols w:num="46" w:space="720"/>'), what: 'w:num 46 (past the cap: kept, not read)' },
  ColsHuge: { body: TEXT(100) + SECT('<w:cols w:num="1000000000" w:space="1000000000" w:sep="1"/>'),
    what: 'w:num and w:space 1e9' },
  ColsUnequal: { body: TEXT(200) + SECT('<w:cols w:num="3" w:equalWidth="0" w:sep="1"><w:col w:w="100" w:space="0"/>'
    + '<w:col w:w="9000" w:space="0"/><w:col w:w="1000000000"/></w:cols>'), what: 'unequal columns of 100 twips and 1e9' },
  ColBreaks: { body: Array.from({ length: 1000 }, (_, i) => p(r('c' + i) + COLBR)).join('')
    + SECT('<w:cols w:num="2" w:space="720"/>'), what: '1,000 column breaks in two columns', least: 500 },
  LnNum: { body: TEXT(200) + SECT('<w:lnNumType w:countBy="1000000000" w:start="1000000000" w:distance="1000000000"/>'),
    what: 'lnNumType countBy, start and distance 1e9' },
  LnNum1: { body: TEXT(300) + SECT('<w:lnNumType w:countBy="1" w:start="2147483647" w:restart="continuous"/>'),
    what: 'lnNumType start 2147483647, continuous' },
  Floats500: { body: p(Array.from({ length: 500 }, (_, i) => anchor({ id: i + 1, w: 20, h: 20,
    ph: off((i % 25) * 24 * EMU), pv: off(Math.floor(i / 25) * 24 * EMU) })).join('') + r(words(0, 40))) + TEXT(80)
    + SECT(), what: '500 floating pictures on one page' },
  Poly4096: { body: p(anchor({ w: 300, h: 300, wrap: poly(4096) }) + r(words(1, 200))) + TEXT(40) + SECT(),
    what: 'a wrap polygon of 4,096 points (the cap)' },
  Poly10000: { body: p(anchor({ w: 300, h: 300, wrap: poly(10000) }) + r(words(1, 200))) + TEXT(40) + SECT(),
    what: 'a wrap polygon of 10,000 points (past the cap)' },
  Absurd: { body: [off('999999999999999'), off('-999999999999999'), off('2147483647'), off('-2147483648'), off('abc'),
    '<wp:align>nowhere</wp:align>', off('NaN'), off('1e9')].map((ph, i) => p(anchor({ id: i + 1, ph,
    pv: off(i % 2 ? '-2147483648' : '2147483647'), hFrom: i === 6 ? 'nowhere' : 'page', vFrom: i === 7 ? 'line' : 'page' })
    + r(words(i, 30)))).join('') + p(anchor({ id: 20, w: 1e6, h: 1e6 }) + r(words(3, 30))) + TEXT(60) + SECT(),
  what: 'anchors with absurd offsets and a 1,000,000 px picture' },
  Tbl200: { body: Array.from({ length: 200 }, (_, i) => ftbl({ horzAnchor: 'page', vertAnchor: 'page',
    tblpX: 1440 + (i % 5) * 400, tblpY: 1440 }, { never: true, n: 1, w: 1500 }) + p(r(`p${i} ` + words(i, 3)))).join('')
    + SECT(), what: '200 floating tables on one page with tblOverlap never' },
  TblPos: { body: [{ tblpX: 1e9, tblpY: 1e9 }, { tblpX: -1e9, tblpY: -1e9 }, {}, { horzAnchor: 'text' },
    { vertAnchor: 'page', tblpYSpec: 'bottom' }, { tblpX: 'abc', tblpY: '' }, { leftFromText: 1e9, bottomFromText: -1e9 },
    { horzAnchor: 'margin', tblpXSpec: 'center', vertAnchor: 'text', tblpY: -31680 }]
    .map((a, i) => ftbl(a, { n: 3 }) + p(r(`after table ${i} ` + words(i, 40))))
    .join('') + TEXT(60) + SECT(), what: 'floating tables at tblpX / tblpY 1e9, -1e9, no attributes, bad values' },
  TblNest: { body: p(r('Before.')) + ftbl({ horzAnchor: 'margin', vertAnchor: 'text', tblpY: 200, rightFromText: 180 },
    { n: 2, w: 5000, cell: (k) => p(r('outer ' + k)) + ftbl({ horzAnchor: 'text', vertAnchor: 'text', tblpX: 100,
      tblpY: 100 }, { n: 2, w: 2000 }) + p(r('after inner ' + k)) }) + TEXT(60) + SECT(),
  what: 'a floating table nested in a floating table\'s cell' },
  Combo: { body: Array.from({ length: 120 }, (_, i) => (i % 7 === 0 ? ftbl({ horzAnchor: 'text', vertAnchor: 'text',
    tblpY: 100 }, { n: 2, w: 600 }) : '') + p((i % 5 === 0 ? anchor({ id: i + 1, w: 30, h: 60 }) : '') + r(words(i, 20))
    + (i % 3 === 0 ? COLBR : ''))).join('') + SECT('<w:cols w:num="45" w:space="20" w:sep="1"/>'
    + '<w:lnNumType w:countBy="1" w:distance="0"/>'), what: '45 columns with floats, floating tables, column breaks and '
    + 'line numbers' },
};
const files = {};
for (const [k, h] of Object.entries(HOSTILE)) files[k] = Array.from(await docx(h.body));
// Outline: 10,000 paragraphs under nine levels of headings
const OUT = [];
for (let i = 0; i < 10000; i++) OUT.push(i % 10 < 9 && i % 3 === 0 ? H(i % 9, `Heading ${i % 9 + 1} at ${i}`) : p(r(`${i} ` + words(i, 8))));
files.Outl = Array.from(await docx(OUT.join('') + SECT()));
files.Webby = Array.from(await docx(TEXT(3000, 0, 30) + SECT()));
// random actions: headings, two columns with a break, line numbers, floats, a floating table, a picture in line
files.Mixed = Array.from(await docx([H(0, 'Title'), TEXT(6), H(1, 'Part'), p(anchor({ id: 1, w: 150, h: 100 })
  + r(words(2, 60))), TEXT(10, 10), p(r('col') + COLBR + r('next')), p(r('end of columns'),
  SECT('<w:cols w:num="2" w:space="720"/>', 'continuous')), H(1, 'Numbers'),
ftbl({ horzAnchor: 'margin', vertAnchor: 'text', tblpXSpec: 'right', tblpY: 100, leftFromText: 180 }, { n: 3 }),
TEXT(30, 30), p(`<w:r>${drawingXml({ id: 9, embed: 'rId11', decl: false })}</w:r>` + r(' inline picture')),
H(2, 'Deep'), TEXT(20, 60)].join('') + SECT('<w:lnNumType w:countBy="5"/>')));

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const { browser, page, logs } = await launch({ height: 900 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const pageErrors = () => logs.filter((l) => /PAGEERROR/.test(l)).length;
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
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => d.leaf === leaf && !d.closed);
    window.__key = (w, code, key, extra = {}) => w.emit('key', { code, key, shift: false, ctrl: false, ...extra });
    window.__open = async (leaf, view = 'print') => {
      await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      const d = window.__doc(leaf);
      if (d.viewName !== view) d.setView(view);
      d.win.open({ x: 60, y: 40, w: 900, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      d.dw.view.focus();
      return d;
    };
    /** Frames until d's pages, column passes and wrap passes are done (or ms pass): the ms taken, or -1. */
    window.__done = async (d, ms) => {
      const t0 = performance.now();
      for (;;) {
        const P = d.view.pages();
        if (!P || (P.done && !d.dw.colDue && !d.dw.wrapDue)) return Math.round(performance.now() - t0);
        if (performance.now() - t0 > ms) return -1;
        await window.__frames(1);
      }
    };
    window.__bad = (d) => {
      const L = d.view.layout, s = d.view.selection;
      if (!s) return L.items.length ? 'no selection' : '';
      for (const q of [s.anchor, s.head]) {
        if (!Number.isInteger(q.off) || q.off < 0) return `off ${q.off}`;
        let b = null;
        const find = (bs) => { for (const x of bs) { if (x.id === q.id) b = x; else if (x.rows) for (const rw of x.rows) for (const c of rw.cells) find(c.blocks); } };
        for (const sc of d.d.doc.sections) find(sc.blocks);
        if (!b) return `no block ${q.id}`;
        if (b.type === 'p' && q.off > b.text.length) return `off ${q.off} > ${b.text.length}`;
      }
      return '';
    };
    /** '' when every page of d and every float on it is finite, else the first that is not. */
    window.__finite = (d) => {
      const P = d.view.layout.place.pages;
      for (let i = 0; i < P.count; i++) {
        const pg = P.at(i);
        if (![pg.top, pg.w, pg.h, pg.bodyTop, pg.frameH].every(Number.isFinite) || !(pg.h > 0)) return `page ${i}`;
        for (const f of P.floatsOf(pg)) if (![f.x, f.y, f.w, f.h].every(Number.isFinite)) return `float on page ${i}`;
      }
      return '';
    };
    window.__json = (d) => JSON.stringify(d.d.doc.sections);
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
  }, files);

  // ------------------------------------------------ hostile documents open, paginate and settle
  for (const [leaf, h] of Object.entries(HOSTILE)) {
    const res = await ev(async ({ leaf }) => {
      const t0 = performance.now();
      const d = await window.__open(leaf);
      const res = { view: d.viewName, wait: await window.__done(d, 60000) };
      res.ms = Math.round(performance.now() - t0);
      const L = d.view.layout, P = L.place.pages, S = L.place.sheet;
      res.count = P.count;
      res.finite = window.__finite(d);
      res.floats = P.floatsOf(P.at(0)).length;
      const last = S.rect(P.at(P.count - 1)), w = d.win;
      res.extent = w.extent.y1 - w.extent.y0 >= last.y + last.h;
      const end = L.items[L.items.length - 1];
      d.view.setSelection({ id: end.id, off: end.kind === 'p' ? end.block.text.length : 0 });
      d.view.flush();
      const c = d.view.caretRect();
      w.scrollTo(0, Math.max(0, Math.round(c.y - 200)));
      w.invalidate();
      await window.__frames(2);
      const before = window.__json(d);
      const t1 = performance.now();
      d.view.type('Z');
      d.view.flush();
      res.key = Math.round(performance.now() - t1);
      await window.__frames(2);
      res.typed = window.__json(d) !== before;
      res.wait2 = await window.__done(d, 60000);
      d.view.press('undo');
      d.view.flush();
      res.wait3 = await window.__done(d, 60000);
      res.undone = window.__json(d) === before;
      res.finite2 = window.__finite(d);
      res.bad = window.__bad(d);
      res.msgs = window.__msgs.splice(0);
      d.dw.close();
      await window.__frames(1);
      return res;
    }, { leaf });
    ok(`${h.what}: opens in Print layout, its pages and passes finish (${res.count} pages, ${res.ms} ms), every page `
      + 'and float finite, the extent holds the last page, typing at the end and undo work, nothing reported',
    res.view === 'print' && res.wait >= 0 && res.wait2 >= 0 && res.wait3 >= 0 && res.count >= (h.least || 1)
      && !res.finite && !res.finite2 && res.extent && res.typed && res.undone && !res.bad && !res.msgs.length
      && !pageErrors(), res);
  }

  // ------------------------------------------------ Outline: 10,000 paragraphs, every level collapsed and expanded
  {
    const o = await ev(async () => {
      const t0 = performance.now();
      const d = await window.__open('Outl', 'outline'), res = { view: d.viewName };
      res.open = Math.round(performance.now() - t0);
      const shown = () => d.view.layout.items.length;
      res.all = shown();
      const heads = d.view.layout.items.filter((it) => it.marker === '+' || it.marker === '-').map((it) => it.id);
      const step = async (what) => {
        const t = performance.now();
        what();
        d.dw.fit();
        await window.__frames(2);
        return [Math.round(performance.now() - t), shown()];
      };
      res.heads = heads.length;
      res.shut = await step(() => { d.dw.collapsed = new Set(heads); });
      res.open1 = await step(() => { d.dw.collapsed = new Set(); });
      const pick = (text) => {
        const m = d.win.menu({}).items.find((i) => i.text === 'Outline').submenu();
        const it = m.items.find((i) => i.text === 'Show level').submenu().items.find((i) => i.text === text);
        it.action(it);
      };
      res.levels = [];
      for (const t of ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8', 'Level 9', 'All']) {
        res.levels.push([t, ...(await step(() => pick(t)))]);
      }
      // type at the end of what is shown and undo
      const L = d.view.layout, end = L.items[L.items.length - 1], before = window.__json(d);
      d.view.setSelection({ id: end.id, off: end.block.text.length });
      d.view.type('Z');
      d.view.flush();
      res.typed = window.__json(d) !== before;
      d.view.press('undo');
      d.view.flush();
      await window.__frames(2);
      res.undone = window.__json(d) === before;
      res.bad = window.__bad(d);
      res.msgs = window.__msgs.splice(0);
      d.dw.close();
      await window.__frames(1);
      return res;
    });
    const slow = [o.shut, o.open1, ...o.levels.map((x) => x.slice(1))].filter(([ms]) => ms > 3000);
    ok('Outline of 10,000 paragraphs: every heading collapsed (only the level 1 headings shown), expanded, Show level 1..9 '
      + 'and All, each step under 3 s; typing and undo; nothing reported',
    o.view === 'outline' && o.all === 10000 && o.heads === 3000 && o.shut[1] === o.levels[0][2] && o.shut[1] < 10000
      && o.open1[1] === 10000
      && o.levels[9][2] === 10000 && o.levels[0][2] < o.levels[8][2] && !slow.length && o.typed && o.undone && !o.bad
      && !o.msgs.length && !pageErrors(), o);
  }

  // ------------------------------------------------ Web layout resized 100 times
  {
    const wb = await ev(async () => {
      const d = await window.__open('Webby', 'web'), res = { view: d.viewName, msgs: [] };
      const t0 = performance.now();
      for (let i = 0; i < 100; i++) {
        d.win.open({ x: d.win.x, y: d.win.y, w: 200 + (i * 137) % 900, h: d.win.h, behind: 'top' });
        await window.__frames(1);
      }
      d.win.open({ x: d.win.x, y: d.win.y, w: 640, h: d.win.h, behind: 'top' });
      res.ms = Math.round(performance.now() - t0);
      // the slices end with every line at the last width
      const vw = Math.round(640 / d.view.zoom) - 64;   // (0.25 in and the 8 px inset each side)
      for (let k = 0; k < 600; k++) {
        const L = d.view.layout;
        if (Math.abs(L.items[0].w - vw) < 1 && Math.abs(L.items[L.items.length - 1].w - vw) < 1 && !d.dw.raf) break;
        await window.__frames(1);
      }
      const L = d.view.layout;
      res.w = [L.items[0].w, L.items[L.items.length - 1].w, vw];
      res.finite = L.items.every((it) => Number.isFinite(it.y) && Number.isFinite(it.h));
      res.pages = d.view.pages();
      res.bad = window.__bad(d);
      res.msgs = window.__msgs.splice(0);
      d.dw.close();
      await window.__frames(1);
      return res;
    });
    ok('Web layout of 3,000 long paragraphs resized 100 times: every item finite, the slices end with every line at the '
      + 'last width, no pages, nothing reported', wb.view === 'web' && wb.pages === null && wb.finite
      && Math.abs(wb.w[0] - wb.w[2]) < 1 && Math.abs(wb.w[1] - wb.w[2]) < 1 && !wb.bad && !wb.msgs.length && !pageErrors(), wb);
  }

  // ------------------------------------------------ 300 random actions across the four views
  {
    await ev(async () => {
      const d = await window.__open('Mixed');
      await window.__done(d, 30000);
      window.__opened = window.__json(d);
    });
    const rnd = rng(20261014), pick = (a) => a[Math.floor(rnd() * a.length)];
    const TEXTS = ['a', 'word ', ' ', 'é', 'x y z', 'longer text to wrap the line further along beside the picture '];
    const bad = [];
    const counts = {};
    for (let k = 0; k < 300; k++) {
      const a = rnd();
      let act;
      if (a < 0.2) act = ['type', pick(TEXTS)];
      else if (a < 0.26) act = ['key', 13, 'Enter'];
      else if (a < 0.31) act = ['key', 127, 'Delete'];
      else if (a < 0.36) act = ['key', 8, 'Backspace'];
      else if (a < 0.40) act = ['press', 'columnBreak'];
      else if (a < 0.42) act = ['brk'];
      else if (a < 0.52) act = ['move', rnd(), rnd()];
      else if (a < 0.57) act = ['wrap', pick(['In line with text', 'Square', 'Tight', 'Top and bottom', 'Behind text', 'In front of text'])];
      else if (a < 0.62) act = ['press', pick(['outlinePromote', 'outlineDemote', 'outlineUp', 'outlineDown'])];
      else if (a < 0.65) act = ['fold', rnd()];
      else if (a < 0.69) act = ['zoom', pick([50, 75, 100, 150, 200])];
      else if (a < 0.73) act = ['size', pick([300, 500, 900, 1200])];
      else if (a < 0.81) act = ['view', pick(['draft', 'print', 'web', 'outline'])];
      else if (a < 0.88) act = ['undo'];
      else if (a < 0.92) act = ['redo'];
      else act = ['scroll', rnd()];
      counts[act[0]] = (counts[act[0]] || 0) + 1;
      const s = await ev(async (act) => {
        const d = window.__doc('Mixed'), w = d.win, v = d.view;
        try {
          const [what, x, y] = act;
          if (what === 'type') v.type(x);
          else if (what === 'key') window.__key(w, x, y);
          else if (what === 'brk') window.__key(w, 13, 'Enter', { ctrl: true });
          else if (what === 'press') v.press(x);
          else if (what === 'move') {
            const ps = [...v.layout.byId.values()].filter((it) => it.kind === 'p');
            const it = ps[Math.floor(x * ps.length)];
            v.setSelection({ id: it.id, off: Math.floor(y * (it.block.text.length + 1)) });
          } else if (what === 'wrap') {
            const it = [...v.layout.byId.values()].find((i) => i.kind === 'p' && i.block.text.includes('\uFFFC'));
            if (it) {
              const o = it.block.text.indexOf('\uFFFC');
              v.setSelection({ id: it.id, off: o }, { id: it.id, off: o + 1 });
              const m = w.menu({}).items.find((i) => i.text === 'Format').submenu().items.find((i) => i.text === 'Wrap text');
              const sub = m.submenu().items.find((i) => i.text === x);
              const shaded = typeof sub.shaded === 'function' ? sub.shaded(sub) : sub.shaded;
              if (!shaded) sub.action(sub);
            }
          } else if (what === 'fold') {
            const hs = v.layout.items.filter((it) => it.marker === '+' || it.marker === '-').map((it) => it.id);
            d.dw.collapsed = new Set(hs.filter((_, i) => (i + 1) * x % 1 < 0.5));
            d.dw.fit();
          } else if (what === 'zoom') d.setZoom(x);
          else if (what === 'size') w.open({ x: w.x, y: w.y, w: x, h: 700, behind: 'top' });
          else if (what === 'view') d.setView(x);
          else if (what === 'undo') v.press('undo');
          else if (what === 'redo') v.press('redo');
          else if (what === 'scroll') w.scrollTo(0, Math.round(x * (w.extent.y1 - w.extent.y0)));
          v.flush();
          await window.__frames(1);
          const pg = v.pages();
          return { why: window.__bad(d) + (window.__msgs.length ? ' msgs ' + window.__msgs.join('|') : '')
            + (pg && !(pg.count >= 1) ? ' no pages' : '') + (os.wimp.menus.isOpen ? ' menu' : '') };
        } catch (e) {
          return { why: 'exception ' + (e.stack || e) };
        }
      }, act);
      if ((s.why || pageErrors()) && bad.length < 5) bad.push(`${k} ${JSON.stringify(act)}: ${s.why} ${pageErrors()}`);
      if (s.why.includes('menu')) await ev(() => os.wimp.menus.close());
    }
    const end = await ev(async () => {
      const d = window.__doc('Mixed');
      d.dw.collapsed = new Set();
      d.setView('print');
      d.setZoom(100);
      const wait = await window.__done(d, 60000);
      const finite = window.__finite(d);
      let n = 0;
      while (d.d.canUndo && n < 5000) { d.view.press('undo'); n++; }
      d.view.flush();
      const wait2 = await window.__done(d, 60000);
      const res = { wait, wait2, finite, n, same: window.__json(d) === window.__opened, bad: window.__bad(d), msgs: window.__msgs.splice(0) };
      d.dw.close();
      await window.__frames(1);
      return res;
    });
    ok('300 random actions across Print layout, Web layout, Outline and Draft (typing, breaks, Wrap text, Outline '
      + 'commands, collapse sets, zoom, sizes, views, undo): the selection valid after each, nothing reported; the pages '
      + 'settle finite; undoing everything gives the opened model',
    !bad.length && end.wait >= 0 && end.wait2 >= 0 && !end.finite && end.same && !end.bad && !end.msgs.length
      && !pageErrors() && counts.view > 10 && counts.wrap > 5 && counts.press > 10, { bad, end, counts });
  }
  const msgs = await ev(() => window.__msgs);
  ok('nothing reported', !msgs.length, msgs);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.slice(0, 10).join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
