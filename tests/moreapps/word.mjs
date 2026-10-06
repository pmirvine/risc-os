// The !Word stub in the real desktop: a .docx opened as a double-click
// opens it starts !Word, which shows it and saves a faithful
// copy (tools/moreapps/!Word). The fixtures are made here with
// build-docx.mjs; the saved copy is checked in Node with readDocx.
// Needs the disc built by tools/disc-moreapps.mjs (assets/disc).
import path from 'node:path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';
import { buildDocx, documentXml, stylesXml, p, r, REL } from './build-docx.mjs';
import { readDocx } from '../../tools/moreapps/!Word/DocxRead';
import { assertSameDoc } from './docx-compare.mjs';

const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const CORE = 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties';

const STYLES = stylesXml(
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>' +
  '<w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160"/>' +
  '</w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>' +
  '<w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/>' +
  '<w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/>' +
  '<w:b/><w:color w:val="2F5496"/><w:sz w:val="40"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>' +
  '<w:basedOn w:val="Heading1"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr>' +
  '<w:rPr><w:sz w:val="28"/></w:rPr></w:style>');

const H = (style, text) => p(r(text), `<w:pStyle w:val="${style}"/>`);
const LONG = 'This paragraph is long enough to be wrapped onto several lines ' +
  'in the window, so that the line breaking can be seen to work: it goes on ' +
  'and on, word after word, until it has filled three or four lines at least.';
const BODY = H('Heading1', 'Quarterly report') +
  p(r('This line has ') + r('bold', '<w:b/>') + r(' and ') + r('italic', '<w:i/>') +
    r(' words, and ') + r('red', '<w:color w:val="C00000"/>') + r(' too.')) +
  p(r('A link: ') + '<w:hyperlink r:id="rIdL"><w:r><w:t>example.com</w:t></w:r></w:hyperlink>' +
    r(' and a picture ') + '<w:r><w:drawing><wp:inline xmlns:wp="' + WP + '">' +
    '<wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="Picture 1"/></wp:inline>' +
    '</w:drawing></w:r>' + r(' and a footnote') +
    '<w:r><w:footnoteReference w:id="1"/></w:r>' + r('.')) +
  '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc>' +
  p(r('a cell')) + '</w:tc></w:tr></w:tbl>' +
  H('Heading2', 'Second heading') +
  p(r(LONG), '<w:ind w:left="720"/>') +
  p(r('Centred'), '<w:jc w:val="center"/>') +
  p('<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>' + r('\tafter a tab'));
const FOOTNOTES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:footnote w:id="1"><w:p><w:r><w:t>A note.</w:t></w:r></w:p></w:footnote></w:footnotes>';
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...Array.from({ length: 64 }, (_, i) => (i * 37) & 255)]);
const CORE_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties ' +
  'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Report</dc:title></cp:coreProperties>';

const fixture = () => buildDocx({
  'word/document.xml': documentXml(BODY),
  'word/styles.xml': STYLES,
  'word/footnotes.xml': FOOTNOTES,
  'word/media/image1.png': PNG,
  'docProps/core.xml': CORE_XML,
}, {
  docRels: [['rIdL', REL('hyperlink'), 'http://example.com/', 'External'],
    ['rIdF', REL('footnotes'), 'footnotes.xml'], ['rIdI', REL('image'), 'media/image1.png']],
  pkgRels: [['rId1', REL('officeDocument'), 'word/document.xml'], ['rId2', CORE, 'docProps/core.xml']],
});
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi'.split(' ');
const big = (n) => {
  const paras = [];
  for (let i = 0; i < n; i++) {
    const w = Array.from({ length: 8 + (i % 7) }, (_, k) => WORDS[(i * 3 + k) % WORDS.length]).join(' ');
    paras.push(i % 100 === 0 ? H('Heading1', `Part ${i / 100 + 1}`) : p(r(`${i}: ${w}`)));
  }
  return buildDocx({ 'word/document.xml': documentXml(paras.join('')), 'word/styles.xml': STYLES });
};

const original = await fixture();
const second = await buildDocx({ 'word/document.xml': documentXml(H('Heading1', 'Another one') + p(r('Two.'))) });
const large = await big(5000);

const { browser, page, logs } = await launch();
const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail)}`);
const shot = (name) => page.screenshot({ path: path.join(SHOTS, name) });
const D = 'RAM::RamDisc0.$.';
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  // the error boxes of Word ('riscos' reportError) are recorded, not shown
  await page.evaluate(([a, b, c]) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    const v = os.vfs;
    v.writeFile('RAM::RamDisc0.$.Report', new Uint8Array(a), { filetype: 0xA7E });
    v.writeFile('RAM::RamDisc0.$.Second', new Uint8Array(b), { filetype: 0xA7E });
    v.writeFile('RAM::RamDisc0.$.Big', new Uint8Array(c), { filetype: 0xA7E });
    const junk = new Uint8Array(500).map((_, i) => (i * 7919 + 13) & 255);
    v.writeFile('RAM::RamDisc0.$.Broken', junk, { filetype: 0xA7E });
    window.__word = () => os.wimp.tasks.filter((t) => t.alive && t.name === 'Word');
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
  }, [Array.from(original), Array.from(second), Array.from(large)]);

  // the Filer showing the .docx
  await page.evaluate(() => os.filer.openDir('RAM::RamDisc0.$', { mode: 'large', x: 60, y: 420, w: 420, h: 200 }));
  await page.waitForTimeout(400);
  await shot('word-filer.png');

  // double-click: the Filer runs it (no Word yet: Alias$@RunType_A7E)
  const r1 = await page.evaluate(async () => {
    const res = { moreApps: os.vfs.isDir('ADFS::HardDisc4.$.MoreApps') };
    const t0 = performance.now();
    await os.filer.run('RAM::RamDisc0.$.Report');
    for (let i = 0; i < 100 && !(window.__word()[0]?.word?.docs.length); i++) await window.__sleep(50);
    res.ms = Math.round(performance.now() - t0);
    const t = window.__word()[0];
    const d = t?.word?.docs[0];
    res.tasks = window.__word().length;
    res.title = d?.win.title;
    res.text = d?.text;
    res.summary = d?.summary;
    res.msgs = [...window.__msgs];
    if (d) {
      d.win.open({ x: 300, y: 80, w: 640, h: 560, behind: 'top' });
      await window.__frames(4);
      const c = d.win._canvas, g = c.getContext('2d');
      const img = g.getImageData(0, 0, c.width, c.height).data;
      const W = c.width, k = W / d.win.w, L = d.view.layout;
      const dark = (x, y) => { const q = (y * W + x) * 4; return img[q] + img[q + 1] + img[q + 2] < 384; };
      // the page: inside its border
      const px0 = Math.ceil((L.pageLeft + 2) * k), px1 = Math.min(W, Math.floor((L.pageLeft + L.pageW - 2) * k));
      const rows = [];
      for (let y = 0; y < c.height; y++) { let n = 0; for (let x = px0; x < px1; x++) if (dark(x, y)) n++; rows.push(n); }
      const at = (x, y) => { const q = (Math.round(y * k) * W + Math.round(x * k)) * 4; return [img[q], img[q + 1], img[q + 2]]; };
      res.band = at(L.pageLeft + 10, 12);
      res.desk = at(2, 2);
      // ink clusters on the page, below its top edge
      const top = Math.ceil(12 * k);
      const clusters = [];
      let start = -1;
      for (let y = top; y < rows.length; y++) {
        if (rows[y] && start < 0) start = y;
        if (!rows[y] && start >= 0) { clusters.push([start, y - start, rows.slice(start, y).reduce((a, b) => a + b, 0)]); start = -1; }
      }
      res.clusters = clusters.slice(0, 4);
      res.ink = rows.slice(top).reduce((a, b) => a + b, 0);
      res.saved = Array.from(await d.saveBytes());
    }
    return res;
  });
  ok('$.MoreApps exists', r1.moreApps);
  ok('double-click starts Word with the document', r1.tasks === 1 && r1.title === 'Report', r1);
  ok('the heading is in the paragraph text', r1.text?.[0] === 'Quarterly report', r1.text);
  ok('summary counts paragraphs, the table and the rest',
    /^7 paragraphs, \d+ preserved items \(/.test(r1.summary ?? '') && /1 table\b/.test(r1.summary)
      && /1 link/.test(r1.summary) && /1 drawing/.test(r1.summary) && /fonts: .*Caladea.*Carlito|fonts: .*Carlito.*Caladea/.test(r1.summary),
    r1.summary);
  ok('no errors opening it', !r1.msgs.length, r1.msgs);
  ok('no info band: the top of the page is white, on a grey desk', r1.band && r1.band.every((v) => v === 255)
    && r1.desk.every((v) => v === 0x88), [r1.band, r1.desk]);
  ok('the document is drawn', r1.ink > 2000, r1.ink);
  ok('the heading is taller than body text', r1.clusters?.length >= 2 && r1.clusters[0][1] > r1.clusters[1][1], r1.clusters);
  await shot('word-window.png');

  // the saved copy reads back the same, unknown parts byte for byte
  try {
    const saved = new Uint8Array(r1.saved ?? []);
    assertSameDoc(await readDocx(saved), await readDocx(original), 'saved copy');
    const back = await readDocx(saved);
    ok('saved copy keeps media, footnotes and docProps', ['word/media/image1.png', 'word/footnotes.xml', 'docProps/core.xml']
      .every((n) => back.parts.has(n)), [...back.parts.keys()]);
    ok('saved copy reads back equal', true);
  } catch (e) {
    ok('saved copy reads back equal', false, e.message.slice(0, 800));
  }

  // the window menu, and its Save box
  const r2 = await page.evaluate(async () => {
    const t = window.__word()[0], d = t.word.docs[0];
    const m = typeof d.win.menu === 'function' ? d.win.menu({}) : d.win.menu;
    const res = { items: m.items.map((i) => i.text) };
    const p = d.win.workToScreen(200, 200);
    os.wimp.menus.open(m, p.x, p.y, { task: t });
    await window.__frames(3);
    return res;
  });
  ok('window menu: Save copy as .docx, Info, Edit, Close', JSON.stringify(r2.items) === '["Save copy as .docx","Info","Edit","Close"]', r2.items);
  await shot('word-menu.png');
  const r3 = await page.evaluate(async () => {
    os.wimp.menus.close();
    const t = window.__word()[0], d = t.word.docs[0];
    const m = typeof d.win.menu === 'function' ? d.win.menu({}) : d.win.menu;
    const item = m.items.find((i) => /^Save copy/.test(i.text));
    const box = typeof item.submenu === 'function' ? item.submenu() : item.submenu;
    const res = { filename: box.filename(), filetype: box.filetype };
    box.icons[1].setText('RAM::RamDisc0.$.Saved');
    box.emit('click', { icon: box.icons[0], button: 'select' });
    for (let i = 0; i < 40 && !os.vfs.exists('RAM::RamDisc0.$.Saved'); i++) await window.__sleep(50);
    const st = os.vfs.stat('RAM::RamDisc0.$.Saved');
    res.type = st?.filetype;
    res.bytes = st ? Array.from(await os.vfs.readFile('RAM::RamDisc0.$.Saved')) : null;
    const info = m.items.find((i) => i.text === 'Info');
    const iw = typeof info.submenu === 'function' ? info.submenu() : info.submenu;
    res.info = iw.icons.map((i) => i.text).join('|');
    return res;
  });
  ok('Save box: leaf name and &A7E', r3.filename === 'Report' && r3.filetype === 0xA7E, r3);
  try {
    assertSameDoc(await readDocx(new Uint8Array(r3.bytes ?? [])), await readDocx(original), 'Save box');
    ok('Save box writes a .docx that reads back equal', r3.type === 0xA7E, r3.type);
  } catch (e) {
    ok('Save box writes a .docx that reads back equal', false, e.message.slice(0, 500));
  }
  ok('Info window shows the summary', /Report/.test(r3.info) && /1 table/.test(r3.info), r3.info);

  // narrower: the column keeps the page's width; the window scrolls
  const r7 = await page.evaluate(async () => {
    const d = window.__word()[0].word.docs[0];
    const before = d.win.extent.y1, lines = d.view.layout.items.map((it) => it.lines);
    d.win.open({ x: 300, y: 80, w: 360, h: 560 });
    await window.__frames(4);
    const L = d.view.layout;
    const after = d.win.extent.y1, wide = d.win.extent.x1 - d.win.extent.x0;
    const res = { before, after, wide, page: L.pageW, left: L.pageLeft, w: d.win.w,
      same: L.items.every((it, i) => it.lines === lines[i]) };
    d.win.open({ x: 300, y: 80, w: 640, h: 560 });
    await window.__frames(4);
    return { ...res, back: d.win.extent.y1 };
  });
  ok('a narrower window keeps the page-width column (scrolls across)',
    r7.after === r7.before && r7.back === r7.before && r7.same && r7.left === 24
      && r7.w === 360 && r7.wide >= Math.ceil(24 + r7.page + 24) && r7.page > 700, r7);

  // the window menu's Save and Info boxes are made once per document:
  // hovering over their arrows again and again makes no new windows
  const rL = await page.evaluate(async () => {
    const t = window.__word()[0], M = os.wimp.menus;
    const hover = (d, n) => {
      const m = d.win.menu({});
      const p = d.win.workToScreen(100, 100);
      M.open(m, p.x, p.y, { task: t });
      const lv = M.levels[0];
      const out = [];
      for (let i = 0; i < n; i++) {
        M._openSub(lv, 0, 'arrow');
        M._openSub(lv, 1, 'arrow');
        if (i === 0 || i === n - 1) out.push([t.windows.size, document.querySelectorAll('*').length]);
      }
      M.close();
      return out;
    };
    const d = t.word.docs[0];
    const res = { cycles: hover(d, 60) };
    // a document's boxes go when it is closed
    const base = t.windows.size;
    const dw = await t.word.open('RAM::RamDisc0.$.Second');
    const d2 = t.word.docs.find((x) => x.win.title === 'Second');
    hover(d2, 3);
    res.open = t.windows.size;
    dw.close();
    res.base = base;
    res.closed = t.windows.size;
    return res;
  });
  const [[w0, n0], [w1, n1]] = rL.cycles;
  ok('60 hovers over the Save and Info arrows make no new windows', w0 === w1 && n1 - n0 < 50, rL.cycles);
  ok('closing a document deletes its boxes', rL.open === rL.base + 3 && rL.closed === rL.base, rL);

  // a second file goes to the running Word; the same file again re-uses its window
  const r4 = await page.evaluate(async () => {
    const t = window.__word()[0];
    await os.cli.run('Run RAM::RamDisc0.$.Second');
    for (let i = 0; i < 60 && t.word.docs.length < 2; i++) await window.__sleep(50);
    await window.__sleep(200);
    const res = { tasks: window.__word().length, docs: t.word.docs.map((d) => d.win.title) };
    const first = t.word.docs[0].win;
    await os.filer.run('RAM::RamDisc0.$.Report');
    await window.__sleep(200);
    res.after = t.word.docs.length;
    const s = os.wimp.stack;
    res.front = s.filter((w) => w.task === t).pop() === first;
    return res;
  });
  ok('a second file opens in the running Word', r4.tasks === 1 && r4.docs.join() === 'Report,Second', r4);
  ok('the same file again brings its window to the front', r4.after === 2 && r4.front, r4);

  // a file that is not a .docx: an error naming it; Word carries on
  const r5 = await page.evaluate(async () => {
    window.__msgs.length = 0;
    const t = window.__word()[0];
    await os.filer.run('RAM::RamDisc0.$.Broken');
    for (let i = 0; i < 40 && !window.__msgs.length; i++) await window.__sleep(50);
    const res = { msgs: [...window.__msgs], alive: t.alive, docs: t.word.docs.length };
    await t.word.open('RAM::RamDisc0.$.Second');
    res.still = t.word.docs.length;
    return res;
  });
  ok('a corrupt file is reported by name', r5.msgs.length === 1 && /Broken/.test(r5.msgs[0]) && /not a Word \.docx file/.test(r5.msgs[0]), r5.msgs);
  // an OLE2 file (older .doc, or an encrypted .docx): the specific reason
  const r5b = await page.evaluate(async () => {
    window.__msgs.length = 0;
    const ole = new Uint8Array(512);
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    os.vfs.writeFile('RAM::RamDisc0.$.OldDoc', ole, { filetype: 0xA7E });
    await os.filer.run('RAM::RamDisc0.$.OldDoc');
    for (let i = 0; i < 40 && !window.__msgs.length; i++) await window.__sleep(50);
    return [...window.__msgs];
  });
  ok('an older .doc or password-protected file says so', r5b.length === 1 && /OldDoc/.test(r5b[0]) && /older Word \(\.doc\) or password-protected file/.test(r5b[0]), r5b);
  ok('Word still responds', r5.alive && r5.docs === 2 && r5.still === 2, r5);

  // a copy that cannot be made: the error names the file
  const rS = await page.evaluate(async () => {
    const t = window.__word()[0];
    const d = t.word.docs.find((x) => x.win.title === 'Second');
    const msgs = [];
    const was = os.wimp.reportError;
    os.wimp.reportError = (m) => { msgs.push(String(m)); return Promise.resolve(1); };
    const keep = d.doc.sections;
    d.doc.sections = null;               // writeDocx throws
    const m = d.win.menu({});
    const box = m.items[0].submenu();
    box.icons[1].setText('RAM::RamDisc0.$.NoCopy');
    box.emit('click', { icon: box.icons[0], button: 'select' });
    for (let i = 0; i < 40 && !msgs.length; i++) await window.__sleep(25);
    os.wimp.reportError = was;
    d.doc.sections = keep;
    return { msgs, exists: os.vfs.exists('RAM::RamDisc0.$.NoCopy') };
  });
  ok('a failed save names the file', rS.msgs.length === 1 && /^'Second' could not be saved: /.test(rS.msgs[0]) && !rS.exists, rS);

  // 5000 paragraphs: opens quickly, scrolls
  const r6 = await page.evaluate(async () => {
    const t = window.__word()[0];
    const t0 = performance.now();
    await t.word.open('RAM::RamDisc0.$.Big');
    await window.__frames(2);
    const res = { ms: Math.round(performance.now() - t0) };
    const d = t.word.docs.find((x) => x.win.title === 'Big');
    res.paras = d?.text.length;
    const ext = d.win.extent.y1;
    res.ext = ext;
    const times = [];
    for (const y of [ext / 4, ext / 2, ext - d.win.h, 0]) {
      const s = performance.now();
      d.win.scrollTo(0, Math.round(y));
      await window.__frames(2);
      times.push(Math.round(performance.now() - s));
    }
    res.scrollMs = times;
    const c = d.win._canvas, img = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let k = 0; k < img.length; k += 4) if (img[k] < 100) n++;
    res.ink = n;
    d.win.scrollTo(0, Math.round(ext / 2));
    await window.__frames(2);
    const img2 = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    n = 0;
    for (let k = 0; k < img2.length; k += 4) if (img2[k] < 100) n++;
    res.ink2 = n;
    return res;
  });
  ok('5000 paragraphs open in under 2 s', r6.paras === 5000 && r6.ms < 2000, r6);
  ok('and scroll (drawn at each place)', r6.ink > 1000 && r6.ink2 > 1000 && r6.scrollMs.every((x) => x < 500), r6);
  // Page Down / Up move the caret and the view together; Ctrl-End
  // and Ctrl-Home go to the ends; other keys are passed on
  const rK = await page.evaluate(async () => {
    const t = window.__word()[0];
    const d = t.word.docs.find((x) => x.win.title === 'Big'), w = d.win;
    w.scrollTo(0, 0);
    os.wimp.setCaret(w);
    d.view.setSelection(d.view.layout.docStart());
    const max = w.extent.y1 - w.h;
    const res = { h: w.h, max, c0: d.view.caretRect().y };
    const key = (code, key, ctrl = false) => {
      const ev = w.emit('key', { code, key, ctrl, shift: false });
      return [w.scrollY, !!ev.handled, !!ev.defaultPrevented, Math.round(d.view.caretRect().y)];
    };
    res.pageDown = key(0x19E, 'PageDown');
    res.pageUp = key(0x19F, 'PageUp');
    res.end = key(0x1AB, 'End', true);
    res.home = key(30, 'Home', true);
    res.other = key(0x185, 'F5');     // (letters are typed now)
    return res;
  });
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(100);
  const rK2 = await page.evaluate(() => window.__word()[0].word.docs.find((x) => x.win.title === 'Big').win.scrollY);
  const pg = rK.h - 32;
  ok('Page Down / Up move the view and the caret; Ctrl-End / Ctrl-Home go to the ends',
    rK.pageDown[0] === pg && Math.abs(rK.pageDown[3] - rK.c0 - pg) < 30 && rK.pageUp[0] === 0
    && Math.abs(rK.end[0] - rK.max) <= 1 && rK.home[0] === 0
    && [rK.pageDown, rK.pageUp, rK.end, rK.home].every((k) => k[1]), rK);
  ok('other keys are passed on', !rK.other[1] && !rK.other[2], rK.other);
  ok('a real Page Down key scrolls', rK2 === pg, rK2);
  console.log(`timings: first open ${r1.ms} ms, 5000 paragraphs ${r6.ms} ms, scrolls ${r6.scrollMs?.join('/')} ms`);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
