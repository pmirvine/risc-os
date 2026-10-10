// !Word's new lists against hostile input in the real desktop
// (task A2.4: AutoFormat lists as you type; A2.6 adds the list
// commands): 1000 rapid '* ' + Ctrl-Z + Ctrl-Z cycles with real keys
// (each conversion undone to the typed '* ', then the typing; the
// document, its numbering and the undo depth as opened at the end);
// in a 50,000-paragraph document a space typed near a paragraph's
// start costs about what a letter does, and markers typed by script
// at 200 paragraph starts ('1. ' .. '100. ' continuing one list,
// '* ' making bullets) each convert within a generous bound, with
// the labels right; undoing everything gives back the opened
// document. A2.6 adds: 100,000 paragraphs made a list in one step
// (Ctrl-Shift-L) and undone; 1000 toggles (Bullets / Numbering, real
// keys and commands); Restart / Continue spam; hostile numbering parts
// (ids at 2^31 - 1, a missing abstract, duplicated and string ids, a
// part without a relationship, mc:AlternateContent) taking every list
// command in the real desktop; a list made inside styles (a Quote
// style, a style numbered by its own numPr, a heading tied to a list);
// and 500 seeded random actions (keys, typed markers, clicks, the list
// ids), each leaving the selection and every block valid, undo of
// everything giving back the opened model. No page errors. Times are
// logged.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, numberingXml, relsXml, REL, stylesXml, p, r } from './build-docx.mjs';
import { lvl, item, listDocx, NUMBERING, STYLES_LIST } from './list-fixtures.mjs';
import { rng } from './word-docs.mjs';
import { checkBlock } from '../../tools/moreapps/!Word/ModelCheck';

const BIG = 50000, STEP = 500;
const docx = (body) => buildDocx({ 'word/document.xml': documentXml(body) });
const files = {
  Small: Array.from(await docx([p(), p(r('after'))].join(''))),
  Big: Array.from(await docx(Array.from({ length: BIG }, (_, i) => p(r(`p${i} word`))).join(''))),
};

// ---- documents for the A2.6 sections
const abs = (id, inner = lvl(0) + lvl(1)) => `<w:abstractNum w:abstractNumId="${id}">${inner}</w:abstractNum>`;
const num = (id, a) => `<w:num w:numId="${id}"><w:abstractNumId w:val="${a}"/></w:num>`;
const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const HOSTILE = {
  HostA: numberingXml(abs(0) + num(1, 9) + num(2, 0)),
  HostB: numberingXml(abs('x') + abs(0) + num('x', 'x') + num(1, 0) + num(2, 0)),
  HostC: numberingXml(abs(0) + num(1, 0) + num(2, 0) + num(2147483647, 0)),
  HostD: numberingXml(abs(2147483647) + num(1, 2147483647) + num(2, 2147483647)),
  HostE: numberingXml(abs(0) + num(1, 0) + num(2, 0) + num(4294967296, 0)),
  HostF: numberingXml(abs(0) + abs(0, lvl(0, { fmt: 'bullet', text: 'o' })) + num(1, 0) + num(1, 0) + num(2, 0)),
  HostG: numberingXml(`<mc:AlternateContent ${MC}><mc:Choice Requires="w14"><w:numPicBullet w:numPicBulletId="0"/></mc:Choice><mc:Fallback>`
    + '<w:numPicBullet w:numPicBulletId="0"/></mc:Fallback></mc:AlternateContent>' + abs(0) + num(1, 0) + num(2, 0) + '<w:numIdMacAtCleanup w:val="2"/>'),
  HostH: numberingXml(''),
};
const hostBody = documentXml(item('a', 1) + p(r('b')) + item('c', 2, 1) + item('d', 2) + p(r('e')));
const hostDoc = (numbering, rels) => buildDocx({ 'word/document.xml': hostBody, 'word/styles.xml': STYLES_LIST, 'word/numbering.xml': numbering,
  ...(rels ? { 'word/_rels/document.xml.rels': rels } : {}) });
const LONGTXT = 'Lists make lines of text stand out, and a long item wraps onto a second line in the window. ';
const PLAIN12 = Array.from({ length: 12 }, (_, i) => p(r(`Item ${i} ` + LONGTXT.slice(0, 30 + i * 6)))).join('');
const STYLED_STYLES = stylesXml('<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>'
  + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
  + '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="1440"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>'
  + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="5"/></w:numPr></w:pPr><w:rPr><w:b/></w:rPr></w:style>'
  + '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>'
  + '<w:style w:type="paragraph" w:styleId="Steps"><w:name w:val="Steps"/><w:basedOn w:val="ListParagraph"/><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr></w:style>');
const sty = (id, t) => p(r(t), `<w:pStyle w:val="${id}"/>`);
const STYLED = listDocx([sty('Quote', 'quote one'), sty('Quote', 'quote two'), sty('Quote', 'quote three'), sty('Heading1', 'A numbered heading'),
  sty('Steps', 'step one'), sty('Steps', 'step two'), sty('Steps', 'step three'), p(r('plain one')), p(r('plain two'))], { numbering: NUMBERING, styles: STYLED_STYLES });
const extra = {
  Huge100k: await docx(Array.from({ length: 100000 }, (_, i) => p(r(`q${i} word`))).join('')),
  Toggle: await docx(PLAIN12), Spam: await docx(PLAIN12), Random: await docx(PLAIN12),
  Styled: await STYLED,
};
for (const [n, x] of Object.entries(HOSTILE)) extra[n] = await hostDoc(x);
extra.HostI = await hostDoc(numberingXml(abs(0) + num(1, 0) + num(2, 0)), relsXml([['rIdS1', REL('styles'), 'styles.xml']]));
for (const [n, b] of Object.entries(extra)) files[n] = Array.from(b);

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const timings = [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = (n = 2) => ev((n) => window.__frames(n), n);

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  const s0 = await ev(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__client = (w, x, y) => {
      const sc = w.workToScreen(x, y), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
      return { x: rc.left + sc.x * k, y: rc.top + sc.y * k };
    };
    window.__doc = (leaf) => window.__word()?.word.docs.find((d) => d.path?.endsWith('.' + leaf));
    window.__json = (d) => JSON.stringify({ s: d.d.doc.sections, n: d.d.doc.numbering?.nums ? [...d.d.doc.numbering.nums.keys()] : null,
      st: d.d.doc.styles ? [...d.d.doc.styles.styles.keys()] : null, rels: d.d.doc.rels, meta: d.d.doc.meta });
    await os.filer.run('RAM::RamDisc0.$.Small');
    for (let i = 0; i < 100 && !window.__doc('Small'); i++) await window.__sleep(50);
    const d = window.__doc('Small');
    d.win.open({ x: 60, y: 40, w: 800, h: 500, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(3);
    window.__small0 = window.__json(d);
    const L = d.view.layout, c = L.caretRect({ id: L.items[0].id, off: 0 });
    const s = d.win.workToScreen(c.x + 1, c.y + c.h / 2), rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
    return { ok: !!d, pt: { x: rc.left + s.x * k, y: rc.top + s.y * k }, depth: d.view.undoDepth };
  }, files);
  ok('the small document opens', s0.ok, s0);

  // ---------------------------------------------------- 1000 rapid '* ' + Ctrl-Z cycles
  await page.mouse.click(s0.pt.x, s0.pt.y);
  await settle();
  const checks = [];
  const t0 = Date.now();
  for (let i = 0; i < 1000; i++) {
    await page.keyboard.type('* ');
    if (i % 100 === 0) {
      await settle(1);
      checks.push(await ev(() => { const v = window.__doc('Small').view; return [v.lines()[0], v.labels()[0]]; }));
    }
    await page.keyboard.press('Control+z');
    if (i % 100 === 0) {
      await settle(1);
      checks.push(await ev(() => { const v = window.__doc('Small').view; return [v.lines()[0], v.labels()[0]]; }));
    }
    await page.keyboard.press('Control+z');
  }
  await settle(3);
  timings.push(`1000 cycles: ${Date.now() - t0} ms`);
  const c1 = await ev(() => {
    const d = window.__doc('Small'), v = d.view;
    return { same: window.__json(d) === window.__small0, depth: v.undoDepth, lines: v.lines(), labels: v.labels(),
      head: v.selection.head.off, msgs: window.__msgs.length };
  });
  ok('1000 rapid "* " + Ctrl-Z cycles: each made a bullet, then gave back "* "; at the end the document as opened (numbering, styles, rels, meta), no undo step left, no error',
    checks.length === 20 && checks.every((c, k) => (k % 2 ? same(c, ['* ', null]) : same(c, ['', '•'])))
    && c1.same && c1.depth === s0.depth && same(c1.lines, ['', 'after']) && c1.head === 0 && !c1.msgs, { checks: checks.slice(0, 4), c1 });

  // ---------------------------------------------------- 50,000 paragraphs
  const b0 = await ev(async () => {
    const t = performance.now();
    await os.filer.run('RAM::RamDisc0.$.Big');
    for (let i = 0; i < 400 && !window.__doc('Big'); i++) await window.__sleep(50);
    const d = window.__doc('Big');
    d.win.open({ x: 80, y: 60, w: 800, h: 500, behind: 'top', scrollX: 0, scrollY: 0 });
    d.dw.view.focus();
    await window.__frames(3);
    window.__big0 = window.__json(d);
    return { ok: !!d, ms: performance.now() - t, n: d.view.lines().length };
  });
  timings.push(`open 50,000: ${Math.round(b0.ms)} ms`);
  ok('the 50,000-paragraph document opens', b0.ok && b0.n === BIG, b0);

  const k1 = await ev(async () => {
    const d = window.__doc('Big'), v = d.view, bs = d.d.doc.sections[0].blocks;
    const time = async (k, ch) => {
      v.setSelection({ id: bs[k].id, off: 2 });
      const t = performance.now();
      v.type(ch);
      v.flush();
      return performance.now() - t;
    };
    const sp = [], x = [];
    for (let i = 0; i < 15; i++) {
      x.push(await time(20000 + i, 'x'));
      sp.push(await time(30000 + i, ' '));
    }
    const med = (a) => a.slice().sort((p, q) => p - q)[a.length >> 1];
    return { x: med(x), sp: med(sp), labels: v.labels().slice(30000, 30015), lines: v.lines().slice(30000, 30002) };
  });
  timings.push(`keystroke with layout, 50,000 paragraphs: letter ${k1.x.toFixed(1)} ms, space near the start ${k1.sp.toFixed(1)} ms`);
  ok('a space typed near a paragraph\'s start (AutoFormat looks, finds no marker) costs about what a letter does (+5 ms)',
    k1.sp <= k1.x + 5 && k1.labels.every((l) => l === null) && k1.lines[0] === 'p3 0000 word', k1);

  const m1 = await ev(async ([STEP]) => {
    const d = window.__doc('Big'), v = d.view, bs = () => d.d.doc.sections[0].blocks;
    const ms = [];
    const typeAt = (k, s) => {
      v.setSelection({ id: bs()[k].id, off: 0 });
      const t = performance.now();
      for (const ch of s) v.type(ch);
      v.flush();
      ms.push(performance.now() - t);
    };
    for (let i = 0; i < 100; i++) typeAt(i * STEP, `${i + 1}. `);
    for (let i = 0; i < 100; i++) typeAt(i * STEP + 1, '* ');
    const labels = v.labels(), lines = v.lines(), b = bs();
    const nums = new Set(), bul = new Set();
    for (let i = 0; i < 100; i++) {
      nums.add(b[i * STEP].pPr.numPr?.numId);
      bul.add(b[i * STEP + 1].pPr.numPr?.numId);
    }
    const sorted = ms.slice().sort((p, q) => p - q);
    return {
      numbers: Array.from({ length: 100 }, (_, i) => labels[i * STEP]).every((l, i) => l === `${i + 1}.`),
      bullets: Array.from({ length: 100 }, (_, i) => labels[i * STEP + 1]).every((l) => l === '•'),
      texts: lines[0] === 'p0 word' && lines[STEP * 99 + 1] === `p${STEP * 99 + 1} word`,
      others: labels.filter((l) => l !== null).length,
      oneList: nums.size === 1, oneBullets: bul.size === 1,
      med: sorted[sorted.length >> 1], max: sorted[sorted.length - 1], depth: v.undoDepth, msgs: window.__msgs.length,
    };
  }, [STEP]);
  timings.push(`200 markers typed by script, 50,000 paragraphs: each (typing + conversion + layout) median ${m1.med.toFixed(1)} ms, max ${m1.max.toFixed(1)} ms`);
  ok('markers typed at 200 paragraph starts of 50,000: "1. " .. "100. " one list numbered 1..100, "* " one bullet list, the markers gone, nothing else numbered',
    m1.numbers && m1.bullets && m1.texts && m1.others === 200 && m1.oneList && m1.oneBullets && !m1.msgs, m1);
  ok('... each within a generous bound (median < 400 ms, max < 3000 ms)', m1.med < 400 && m1.max < 3000, m1);

  const u1 = await ev(async () => {
    const d = window.__doc('Big');
    const t = performance.now();
    while (d.d.canUndo) d.d.undo();
    d.view.flush();
    return { same: window.__json(d) === window.__big0, ms: performance.now() - t, msgs: window.__msgs.length };
  });
  timings.push(`undo everything: ${Math.round(u1.ms)} ms`);
  ok('undoing everything gives back the opened 50,000-paragraph document (numbering, styles, rels, meta)', u1.same && !u1.msgs, u1);

  // ================================================================ A2.6
  const modelBad = (json) => {
    try {
      for (const sct of JSON.parse(json)) for (const b of sct.blocks) checkBlock(b);
      return '';
    } catch (e) {
      return e.message;
    }
  };
  const pageErrors = () => logs.filter((l) => /PAGEERROR/.test(l)).length;
  await ev(() => {
    window.__open = async (leaf, at = {}) => {
      const real = await window.__word().word.open(`RAM::RamDisc0.$.${leaf}`);
      real.win.open({ x: 100, y: 60, w: 860, h: 480, ...at, behind: 'top', scrollX: 0, scrollY: 0 });
      await window.__frames(2);
      real.view.focus();
      window.__cur = leaf;
      window.__real = real;
      return window.__doc(leaf);
    };
    window.__d = () => window.__doc(window.__cur);
    window.__model = (d) => JSON.stringify({ s: d.d.doc.sections, n: d.d.doc.numbering?.nums ? [...d.d.doc.numbering.nums.keys()] : null,
      st: d.d.doc.styles ? [...d.d.doc.styles.styles.keys()] : null, rels: d.d.doc.rels, meta: d.d.doc.meta });
    window.__undoAll = (d) => { let n = 0; while (d.d.canUndo && n < 20000) { d.view.press('undo'); n++; } d.view.flush(); return n; };
    window.__at = (d, i, off = 0) => d.view.setSelection({ id: d.view.layout.items[i].id, off });
    window.__bad = (d) => {
      const L = d.view.layout, sel = d.view.selection;
      if (!sel) return L.items.length ? 'no selection' : '';
      for (const q of [sel.anchor, sel.head]) {
        const it = L.byId.get(q.id);
        if (!it) return `no item ${q.id}`;
        if (!Number.isInteger(q.off) || q.off < 0) return `off ${q.off}`;
        if (it.kind === 'box') { if (q.off > 1) return 'box off'; continue; }
        if (q.off > it.block.text.length) return `off ${q.off} > ${it.block.text.length}`;
      }
      for (const it of L.items) if (!Number.isFinite(it.y) || !Number.isFinite(it.h) || it.h < 0 || it.h > 5e5) return `item ${it.id} y ${it.y} h ${it.h}`;
      return '';
    };
  });

  // ---------------------------------------------------- 100,000 paragraphs made a list
  {
    const t0 = Date.now();
    await ev(async () => { await window.__open('Huge100k'); });
    const opened = Date.now() - t0;
    await ev(() => { window.__opened = window.__model(window.__d()); window.__real.view.focus(); });
    await page.keyboard.press('Control+a');
    await settle();
    const t1 = Date.now();
    await page.keyboard.press('Control+Shift+L');
    await settle();
    const make = Date.now() - t1;
    const mid = await ev(() => {
      const d = window.__d(), v = d.view, bs = d.d.doc.sections[0].blocks, labels = v.labels();
      return { n: bs.length, first: labels[0], mid: labels[50000], last: labels[99999], ids: new Set([bs[0], bs[50000], bs[99999]].map((b) => b.pPr.numPr?.numId)).size,
        style: bs[777].pStyle, depth: v.undoDepth, bad: window.__bad(d), msgs: window.__msgs.length };
    });
    const t2 = Date.now();
    await page.keyboard.press('Control+z');
    await settle();
    const undo = Date.now() - t2;
    const t3 = Date.now();
    const more = await ev(async () => {
      const d = window.__d(), v = d.view, its = v.layout.items;
      v.setSelection({ id: its[0].id, off: 0 }, { id: its.at(-1).id, off: 1 });
      v.format('numbering');
      v.flush();
      window.__at(d, 50000, 0);
      v.format('listRestart', 1);
      v.flush();
      await window.__frames(2);
      const labels = v.labels();
      const res = { a: labels[49999], b: labels[50000], c: labels[50001], bad: window.__bad(d) };
      v.format('listContinue');
      v.flush();
      res.cont = v.labels()[50000];
      res.undone = window.__undoAll(d);
      res.back = window.__model(d) === window.__opened;
      window.__real.close();
      return res;
    });
    const rest = Date.now() - t3;
    timings.push(`100,000 paragraphs: open ${opened} ms, Ctrl-Shift-L ${make} ms, undo ${undo} ms, numbering + Restart + Continue + undo all ${rest} ms`);
    ok('100,000 paragraphs: Ctrl-Shift-L makes one bullet list in one undo step under 10 s; Ctrl-Z under 8 s gives it back; Numbering, Restart in the middle '
      + '(50,001. becomes 1.) and Continue (back to 50,001.) then undo of everything give back the opened model; no errors',
    mid.n === 100000 && mid.first === '•' && mid.mid === '•' && mid.last === '•' && mid.ids === 1 && mid.style === 'ListParagraph' && mid.depth === 1 && !mid.bad
      && make < 10000 && undo < 8000 && more.a === '50000.' && more.b === '1.' && more.c === '2.' && more.cont === '50001.' && more.back && !mid.msgs && !pageErrors(),
    { mid, more, make, undo });
  }

  // ---------------------------------------------------- 1000 toggles
  {
    await ev(async () => { const d = await window.__open('Toggle'); window.__opened = window.__model(d); window.__at(d, 2, 3); });
    const t0 = Date.now();
    for (let k = 0; k < 100; k++) await page.keyboard.press('Control+Shift+L');
    await settle();
    const real = Date.now() - t0;
    const after100 = await ev(() => window.__d().view.labels()[2]);
    const tg = await ev(async () => {
      const d = window.__d(), v = d.view;
      let worst = 0;
      for (let k = 0; k < 450; k++) {
        const t = performance.now();
        v.format(k % 3 === 0 ? 'bullets' : 'numbering', k % 5 === 0 ? 'check' : k % 7 === 0 ? 'A.' : undefined);
        v.format(k % 2 ? 'bullets' : 'numbering');
        worst = Math.max(worst, performance.now() - t);
        if (k % 50 === 0) window.__at(d, 1 + (k % 10), 0);
      }
      v.flush();
      await window.__frames(2);
      const res = { worst, depth: v.undoDepth, bad: window.__bad(d), json: JSON.stringify(d.d.doc.sections), nums: d.d.doc.numbering ? d.d.doc.numbering.nums.size : 0, msgs: window.__msgs.length };
      res.undone = window.__undoAll(d);
      res.back = window.__model(d) === window.__opened;
      window.__real.close();
      return res;
    });
    timings.push(`1000 toggles: 100 real Ctrl-Shift-L ${real} ms, worst command pair ${Math.round(tg.worst)} ms, ${tg.nums} nums made`);
    ok('1000 toggles (100 real Ctrl-Shift-L, 900 Bullets / Numbering commands with entries, switching kinds) on carets: the first 100 end with the item out of its list, '
      + 'model and selection valid, each pair under 250 ms; undoing everything gives back the opened model (no numbering part)',
    after100 === null && !tg.bad && !modelBad(tg.json) && tg.worst < 250 && tg.back && tg.depth >= 500 && !tg.msgs, { ...tg, json: undefined, after100 });
  }

  // ---------------------------------------------------- Restart spam
  {
    const sp = await ev(async () => {
      const d = await window.__open('Spam'), v = d.view;
      const opened = window.__model(d);
      v.setSelection({ id: v.layout.items[0].id, off: 0 }, { id: v.layout.items.at(-1).id, off: 1 });
      v.format('numbering');
      let worst = 0;
      const starts = [1, 5, 0, 32767, 2147483647, 2147483648, -1, 1.5, 'x', null, 9];
      for (let k = 0; k < 600; k++) {
        window.__at(d, k % 12, 0);
        const t = performance.now();
        v.format(k % 4 === 3 ? 'listContinue' : 'listRestart', starts[k % starts.length]);
        worst = Math.max(worst, performance.now() - t);
        if (k % 100 === 0) { v.flush(); const w = window.__bad(d); if (w) return { why: w, k }; }
      }
      v.flush();
      await window.__frames(2);
      const res = { worst, nums: d.d.doc.numbering.nums.size, depth: v.undoDepth, bad: window.__bad(d), json: JSON.stringify(d.d.doc.sections), labels: v.labels().slice(0, 3), msgs: window.__msgs.length };
      res.undone = window.__undoAll(d);
      res.back = window.__model(d) === opened;
      window.__real.close();
      return res;
    });
    timings.push(`Restart spam: 600 commands, worst ${Math.round(sp.worst || 0)} ms, ${sp.nums} nums at the end`);
    ok('600 Restart / Start at / Continue commands (good starts, 0, 32767, 2^31 - 1 and refused ones: 2^31, -1, 1.5, text, null) on twelve items: '
      + 'each under 250 ms, the model valid, the labels worked out; undoing everything gives back the opened model', !sp.why && !sp.bad && !modelBad(sp.json) && sp.worst < 250
      && sp.back && !sp.msgs, { ...sp, json: undefined });
  }

  // ---------------------------------------------------- hostile numbering parts
  {
    const names = [...Object.keys(HOSTILE), 'HostI'];
    const res = [];
    for (const n of names) {
      const r1 = await ev(async (n) => {
        const d = await window.__open(n), v = d.view, opened = window.__model(d);
        const out = { n, steps: [], refused: 0 };
        const run = (what, fn) => {
          const depth = v.undoDepth, before = window.__model(d);
          try { fn(); } catch (e) { out.steps.push(`${what}: threw ${e.message}`); }
          v.flush();
          if (v.undoDepth === depth && window.__model(d) !== before) out.steps.push(`${what}: changed with no undo step`);
          if (v.undoDepth === depth) out.refused++;
          const w = window.__bad(d);
          if (w) out.steps.push(`${what}: ${w}`);
        };
        v.setSelection({ id: v.layout.items[0].id, off: 0 }, { id: v.layout.items.at(-1).id, off: 1 });
        run('bullets on all', () => v.format('bullets'));
        window.__at(d, 1, 0);
        run('numbering on b', () => v.format('numbering', 'i.'));
        window.__at(d, 0, 0);
        run('bullets on a', () => v.format('bullets', 'disc'));
        window.__at(d, 2, 0);
        run('restart c', () => v.format('listRestart', 3));
        window.__at(d, 3, 0);
        run('continue d', () => v.format('listContinue'));
        window.__at(d, 4, 0);
        run('numbering on e', () => v.format('numbering'));
        window.__at(d, 4, 0);
        run('type * and space', () => { v.type('*'); v.type(' '); });
        out.json = JSON.stringify(d.d.doc.sections);
        out.msgs = window.__msgs.length;
        window.__undoAll(d);
        out.back = window.__model(d) === opened;
        window.__real.close();
        return out;
      }, n);
      res.push(r1);
    }
    const bad = res.filter((x) => x.steps.length || !x.back || modelBad(x.json) || x.msgs);
    const refused = res.map((x) => `${x.n}:${x.refused}`).join(' ');
    timings.push('hostile numbering parts, commands refused per document: ' + refused);
    ok('hostile numbering parts (missing abstract, string ids, ids at 2^31 - 1 and past, duplicated ids, mc:AlternateContent, empty part, no relationship) '
      + 'take Bullets, Numbering, Restart, Continue and a typed "* " in the real desktop: no exception, a refused command changes nothing and makes no undo step, '
      + 'the model and selection valid; undoing everything gives back the opened model', !bad.length && !pageErrors()
      && res.filter((x) => x.refused > 0).length >= 3, { bad: bad.map((x) => ({ ...x, json: undefined })), refused });
  }

  // ---------------------------------------------------- lists inside styles
  {
    const st = await ev(async () => {
      const d = await window.__open('Styled'), v = d.view, opened = window.__model(d);
      const bs = () => d.d.doc.sections[0].blocks;
      const out = { steps: [] };
      const chk = (what) => { v.flush(); const w = window.__bad(d); if (w) out.steps.push(`${what}: ${w}`); };
      const sel = (a, b) => v.setSelection({ id: v.layout.items[a].id, off: 0 }, { id: v.layout.items[b].id, off: 1 });
      sel(0, 2);
      v.format('bullets');
      chk('bullets on Quote');
      out.quote = bs().slice(0, 3).map((b) => [b.pStyle, b.pPr.numPr && b.pPr.numPr.numId]);
      out.quoteLabels = v.labels().slice(0, 3);
      v.format('bullets');
      chk('bullets off Quote');
      out.quoteOff = bs().slice(0, 3).map((b) => [b.pStyle, b.pPr.numPr && b.pPr.numPr.numId]);
      window.__at(d, 3, 0);
      const headLabel = v.labels()[3];
      v.format('bullets');
      chk('bullets on the numbered heading');
      out.head = [headLabel, v.labels()[3], bs()[3].pPr.numPr];
      v.format('numbering');
      chk('numbering on the heading');
      out.head2 = [v.labels()[3], bs()[3].pPr.numPr, bs()[3].pStyle];
      sel(4, 6);
      const stepsBefore = v.labels().slice(4, 7);
      v.format('numbering');
      chk('numbering on Steps');
      out.steps2 = [stepsBefore, v.labels().slice(4, 7), bs().slice(4, 7).map((b) => b.pStyle)];
      v.format('bullets');
      chk('bullets on Steps');
      out.steps3 = [v.labels().slice(4, 7), bs().slice(4, 7).map((b) => b.pPr.numPr && b.pPr.numPr.numId)];
      sel(7, 8);
      v.format('numbering');
      chk('numbering on plain');
      out.plain = [v.labels().slice(7, 9), bs().slice(7, 9).map((b) => b.pStyle)];
      v.format('listRestart', 7);
      chk('restart plain');
      out.restart = v.labels().slice(7, 9);
      out.json = JSON.stringify(d.d.doc.sections);
      out.msgs = window.__msgs.length;
      window.__undoAll(d);
      out.back = window.__model(d) === opened;
      window.__real.close();
      return out;
    });
    ok('lists made inside styles: a Quote style keeps its style (no List Paragraph), a style numbered by its own numPr (Steps) and a numbered heading take Numbering / Bullets, '
      + 'plain paragraphs get List Paragraph; every step valid; undo of everything gives back the opened model',
    !st.steps.length && st.quote.every(([sty, id]) => sty === 'Quote' && id > 0) && st.quoteLabels.every((l) => l === '•') && st.quoteOff.every(([sty, id]) => sty === 'Quote' && !id)
      && st.plain[1].every((x) => x === 'ListParagraph') && st.plain[0][0] === '1.' && st.restart[0] === '7.' && st.back && !modelBad(st.json) && !st.msgs && !pageErrors(), { ...st, json: undefined });
  }

  // ---------------------------------------------------- 500 random actions
  {
    const box = await ev(async () => {
      const d = await window.__open('Random', { h: 420 }), w = d.win;
      window.__opened = window.__model(d);
      const a = window.__client(w, w.scrollX, w.scrollY), b = window.__client(w, w.scrollX + w.w, w.scrollY + w.h);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y, top: d.view.layout.top };
    });
    const rnd = rng(20261010), pick1 = (a) => a[Math.floor(rnd() * a.length)];
    const KEYS = ['Control+Shift+L', 'Control+Shift+L', 'Tab', 'Shift+Tab', 'Enter', 'Backspace', 'Delete', 'Control+z', 'Control+y', 'Home', 'End', 'ArrowUp', 'ArrowDown',
      'Shift+ArrowDown', 'Shift+End', 'Control+a', 'Control+b', 'Escape', 'Control+1', 'Control+2'];
    const TYPED = ['* ', '1. ', '- ', 'a) ', '(2) ', 'IV. ', '> ', 'x', 'word ', 'é', '\u{1F600}'];
    const IDS = [['bullets'], ['bullets', 'check'], ['bullets', 'dash'], ['bullets', 'zzz'], ['numbering'], ['numbering', 'I.'], ['numbering', 'a)'], ['numbering', 'disc'],
      ['listRestart', 1], ['listRestart', 5], ['listRestart', 2147483648], ['listRestart', 'x'], ['listContinue'], ['listIn'], ['listOut'], ['listOff']];
    const at = () => ({ x: box.x0 + 2 + rnd() * (box.x1 - box.x0 - 4), y: box.y0 + box.top + 2 + rnd() * (box.y1 - box.y0 - box.top - 4) });
    const kinds = {};
    const bad = [];
    for (let k = 0; k < 500; k++) {
      const a = rnd();
      let what;
      if (a < 0.35) {
        what = pick1(KEYS);
        await page.keyboard.press(what);
      } else if (a < 0.5) {
        what = 'text';
        await page.keyboard.type(pick1(TYPED));
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
      } else {
        const [id, arg] = pick1(IDS);
        what = 'format ' + id;
        await ev(([id, arg]) => { try { window.__d().view.format(id, arg); } catch (e) { window.__msgs.push('threw ' + e.message); } }, [id, arg]);
      }
      const kind = what.startsWith('format') ? 'format' : ['text', 'mouse'].includes(what) ? what : 'key';
      kinds[kind] = (kinds[kind] || 0) + 1;
      const sv = await ev(async () => {
        await window.__frames(1);
        const d = window.__d();
        if (!d || !window.__doc(window.__cur)) return { why: 'window gone', json: '[]' };
        let why = window.__bad(d) + (window.__msgs.length ? ' msgs ' + window.__msgs.slice(-1) : '');
        if (os.wimp.menus.isOpen) os.wimp.menus.close();
        try { d.view.labels(); } catch (e) { why += ' labels threw ' + e.message; }
        return { why, json: JSON.stringify(d.d.doc.sections) };
      });
      const mb = modelBad(sv.json);
      if ((sv.why || mb) && bad.length < 5) bad.push(`${k} (${what}): ${sv.why} ${mb}`);
      if (sv.why === 'window gone') break;
    }
    const end = await ev(() => {
      const d = window.__d();
      const n = window.__undoAll(d);
      const res = { n, same: window.__model(d) === window.__opened, dirty: d.view.dirty, bad: window.__bad(d), errs: window.__msgs.length };
      window.__real.close();
      return res;
    });
    ok('500 random keys (Ctrl-Shift-L, Tab, Shift-Tab, Enter among them), typed markers (* 1. - a) (2) IV. >), clicks and drags and the list ids (with bad entries and starts): '
      + 'selection and every block valid after each, no errors; undoing everything gives back the opened model',
    !bad.length && end.same && !end.dirty && !end.bad && !end.errs && !pageErrors() && Object.keys(kinds).length >= 4, { bad, end, kinds });
    timings.push('random actions: ' + JSON.stringify(kinds));
  }
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
console.log(timings.map((t) => 'time: ' + t).join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
