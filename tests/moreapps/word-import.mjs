// !Letters opening OpenDocument text (&A81) and Word 97-2003 .doc
// (&AE6) files in the real desktop (ODT/.doc import, task 17), with
// real windows: the boot files claim both types; a double-click starts
// Letters (and hands a second file to the running one); an ODT with a
// heading, bold and italic, a list, a merged table cell, a footnote, a
// tracked change, a comment and a picture, and a .doc with the same
// kinds, open as imported .docx windows titled with the file's leaf,
// modified from the start, the one-time notice said (with the
// reader's notes when it had any); closing and Quit ask. Never over
// the original: Ctrl+S, the menu's Save, the close prompt's Save and
// Save a copy suggest <leaf>/docx, the original's path is refused
// there and by Export as PDF; a new name writes a .docx (&A7E) that
// reopens as a plain .docx window; Revert reads the original again;
// Save as offers .docx or RTF; two imports are independent and the
// same file opened twice raises its window; files that are not what
// they say (Word 6/95, encrypted, damaged, not Word, a spreadsheet,
// 1 byte, empty, random bytes) are said in plain words and open no
// window, files opened by content not by type (a .docx called .odt,
// RTF called .doc, an ODT called .docx); Print and Export as PDF work.
// The original files' bytes are compared after every step.
// Needs the disc built by tools/disc-moreapps.mjs (assets/disc).
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, p, r } from './build-docx.mjs';
import { makeOdt, storedZip } from './odt-helpers.mjs';
import { makeDoc, makeCfb } from './doc-helpers.mjs';
import { richDoc } from './doc-review-helpers.mjs';
import { pngBytes, gifBytes } from './pic-fixtures.mjs';
import { readDocx } from '../../tools/moreapps/!Letters/DocxRead';

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const t0 = Date.now();

// ------------------------------------------------ the files (spec-derived builders)
const P = (s) => `<text:p>${s}</text:p>`;
const AUTO = '<style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>'
  + '<style:style style:name="T2" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>'
  + '<text:list-style style:name="L1"><text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix="."/></text:list-style>';
const RICH = '<text:tracked-changes><text:changed-region text:id="i1"><text:insertion><office:change-info>'
  + '<dc:creator>Ann</dc:creator><dc:date>2024-01-02T00:00:00</dc:date></office:change-info></text:insertion>'
  + '</text:changed-region></text:tracked-changes>'
  + '<text:h text:outline-level="1">Imported heading</text:h>'
  + P('Some <text:span text:style-name="T1">bold</text:span> and <text:span text:style-name="T2">italic</text:span> text'
    + '<text:note text:id="n1" text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body>'
    + P('The footnote.') + '</text:note-body></text:note>.')
  + P('Changed: <text:change-start text:change-id="i1"/>inserted<text:change-end text:change-id="i1"/> words, '
    + '<office:annotation office:name="c1"><dc:creator>Ann</dc:creator>' + P('A comment.')
    + '</office:annotation>remarked<office:annotation-end office:name="c1"/>.')
  + '<text:list text:style-name="L1"><text:list-item>' + P('first item') + '</text:list-item><text:list-item>'
  + P('second item') + '</text:list-item></text:list>'
  + '<table:table table:name="T"><table:table-column table:number-columns-repeated="2"/><table:table-row>'
  + '<table:table-cell table:number-columns-spanned="2">' + P('merged cell') + '</table:table-cell>'
  + '<table:covered-table-cell/></table:table-row><table:table-row><table:table-cell>' + P('cell c')
  + '</table:table-cell><table:table-cell>' + P('cell d') + '</table:table-cell></table:table-row></table:table>'
  + P('a picture <draw:frame svg:width="2cm" svg:height="1cm"><draw:image xlink:href="Pictures/a.png"/></draw:frame> here');
// (a table of contents and a script: the reader's two notes)
const NOTED = P('Noted text') + '<text:table-of-content text:name="T"><text:index-body>' + P('toc')
  + '</text:index-body></text:table-of-content>' + P('<text:script script:language="x">x</text:script>after');
const ODS = storedZip([['mimetype', 'application/vnd.oasis.opendocument.spreadsheet', { deflate: true }],
  ['META-INF/manifest.xml', '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>'],
  ['content.xml', '<office:document-content/>']]);
const rich = richDoc().bytes;
const ODT = 0xA81, DOC = 0xAE6, DOCX = 0xA7E;
const enc = (s) => new TextEncoder().encode(s);
const FILES = {
  'Rich/odt': [makeOdt({ auto: AUTO, content: RICH, pictures: { 'a.png': pngBytes(4, 2) } }), ODT],
  'Noted/odt': [makeOdt({ content: NOTED }), ODT],
  'Second/odt': [makeOdt({ content: P('Second ODT text.') }), ODT],
  'Rich/doc': [rich, DOC],
  'Plain/doc': [makeDoc({ text: 'Plain doc text.\r' }), DOC],
  // (a GIF: kept by the reader, one thing an RTF file cannot hold)
  'Gif/odt': [makeOdt({ content: P('a <draw:frame svg:width="2cm" svg:height="1cm"><draw:image xlink:href="Pictures/b.gif"/>'
    + '</draw:frame> GIF'), pictures: { 'b.gif': gifBytes(4, 2) } }), ODT],
  // refused
  'Old/doc': [makeDoc({ text: 'a\r', version: 0x65 }), DOC],
  'Locked/doc': [makeDoc({ text: 'a\r', encrypted: true }), DOC],
  'Cut/doc': [rich.slice(0, 700), DOC],
  'Sheet/doc': [makeCfb({ streams: { Workbook: new Uint8Array(100) } }), DOC],
  'Sheet/odt': [ODS, ODT],
  'One/doc': [new Uint8Array([7]), DOC],
  'Empty/odt': [new Uint8Array(0), ODT],
  'Junk/doc': [new Uint8Array(300).map((_, i) => (i * 7919 + 13) & 255), DOC],
  'DropA/odt': [makeOdt({ content: P('Dropped A.') }), ODT],
  'DropB/odt': [makeOdt({ content: P('Dropped B.') }), ODT],
  'DropC/doc': [makeDoc({ text: 'Dropped C.\r' }), DOC],
  'DropE/odt': [makeOdt({ content: P('Dropped E.') }), ODT],
  'DropD/doc': [makeDoc({ text: 'Dropped D.\r' }), DOC],
  'Junk/odt': [new Uint8Array(300).map((_, i) => (i * 7919 + 13) & 255), ODT],
  // opened by what they are
  'Disguise/odt': [await buildDocx({ 'word/document.xml': documentXml(p(r('A docx called odt.'))) }), ODT],
  'Rtf/doc': [enc('{\\rtf1\\ansi{\\fonttbl{\\f0 Times;}}\\f0 RTF called doc.\\par}'), DOC],
  'Odt/docx': [makeOdt({ content: P('An ODT called docx.') }), DOCX],
};
const ORIGINALS = ['Rich/odt', 'Noted/odt', 'Second/odt', 'Rich/doc', 'Plain/doc', 'Gif/odt', 'DropA/odt', 'DropB/odt', 'DropC/doc', 'DropD/doc', 'DropE/odt'];
const D = 'RAM::RamDisc0.$.';
const head = (leaf, label) => `'${leaf}' was opened from ${label} file; it will be saved as a .docx.`;
// a written .docx read back: its paragraphs' text (table cells' too), as one string
const textsOf = async (bytes) => JSON.stringify((await readDocx(new Uint8Array(bytes))).sections);

const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);
// a button of an open window, clicked with the real mouse
const clickButton = async (text) => {
  const at = await ev((t) => {
    const w = [...os.wimp.windows].find((q) => q.isOpen && q.iconByName?.('button:' + t));
    if (!w) return null;
    const c = w.iconByName('button:' + t).bbox;
    const s = w.workToScreen((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2);
    const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
    return { x: rc.left + s.x * k, y: rc.top + s.y * k };
  }, text);
  if (!at) throw new Error('no button ' + text);
  await page.mouse.click(at.x, at.y);
  await ev(() => window.__frames(3));
};
// the originals unchanged, byte for byte
const same = async (step) => {
  const bad = await ev(() => window.__same());
  ok(`${step}: the original files' bytes are unchanged`, !bad.length, bad);
};
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(([files, originals, D]) => {
    window.__msgs = [];
    window.__queries = [];
    window.__answer = 'Cancel';
    const rec = (m, o) => { window.__msgs.push([String(m), o?.category ?? null]); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    globalThis.__riscos.query = (o) => { window.__queries.push({ message: o.message, buttons: o.buttons }); return Promise.resolve(window.__answer); };
    window.__orig = {};
    for (const [leaf, [bytes, type]] of Object.entries(files)) {
      os.vfs.writeFile(D + leaf, new Uint8Array(bytes), { filetype: type });
      if (originals.includes(leaf)) window.__orig[leaf] = { bytes, type };
    }
    window.__same = async () => {
      const bad = [];
      for (const [leaf, o] of Object.entries(window.__orig)) {
        const st = os.vfs.stat(D + leaf);
        const b = st ? Array.from(await os.vfs.readFile(D + leaf)) : null;
        if (!st || st.filetype !== o.type || !b || b.length !== o.bytes.length || b.some((x, i) => x !== o.bytes[i])) bad.push(leaf);
      }
      return bad;
    };
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__tasks = () => os.wimp.tasks.filter((t) => t.alive && t.name === 'Letters').length;
    window.__by = (leaf) => window.__word()?.word?.docs.find((d) => d.leaf === leaf && !d.closed);
    window.__wait = async (fn, n = 200) => { for (let i = 0; i < n && !fn(); i++) await window.__sleep(25); return fn(); };
    window.__item = (d, text) => d.win.menu({}).items.find((i) => i.text === text);
    window.__prompts = () => [...os.wimp.windows].filter((q) => q.isOpen && q.iconByName?.('button:Discard'));
    window.__text = (w) => w.icons.map((i) => i?.text ?? '').filter(Boolean).join(' ');
    window.__exists = (leaf) => os.vfs.exists(D + leaf);
    // a double-click in the Filer (os.filer.run), then the window or a message
    window.__run = async (leaf) => {
      window.__msgs.length = 0;
      await os.filer.run(D + leaf);
      await window.__wait(() => window.__by(leaf) || window.__msgs.length);
      await window.__frames(3);
      const d = window.__by(leaf);
      return { open: !!d, title: d?.win.title, format: d?.format, imported: d?.imported ?? null, from: d?.importedFrom ?? null,
        path: d?.path ?? null, text: d && (d.text.join('\n') + '\n' + JSON.stringify(d.doc.sections)), dirty: d?.view.dirty, msgs: window.__msgs.map((m) => m[0]),
        cats: window.__msgs.map((m) => m[1]), tasks: window.__tasks() };
    };
  }, [Object.fromEntries(Object.entries(FILES).map(([k, [b, t]]) => [k, [Array.from(b), t]])), ORIGINALS, D]);

  // ------------------------------------------------ the boot files claim &A81 and &AE6
  const boot = await ev(() => ({ a81: os.sysvars.get('File$Type_A81'), ae6: os.sysvars.get('File$Type_AE6'),
    ra81: os.sysvars.get('Alias$@RunType_A81'), rae6: os.sysvars.get('Alias$@RunType_AE6'),
    types: [os.vfs.stat('RAM::RamDisc0.$.Rich/odt').filetype, os.vfs.stat('RAM::RamDisc0.$.Rich/doc').filetype],
    running: window.__tasks() }));
  ok('File$Type_A81 is ODT, File$Type_AE6 MSWord; the files have those types', boot.a81 === 'ODT' && boot.ae6 === 'MSWord'
    && boot.types[0] === 0xA81 && boot.types[1] === 0xAE6, boot);
  ok('Alias$@RunType_A81 and _AE6 run !Letters', /MoreApps\.!Letters\.!Run %\*0$/.test(boot.ra81 ?? '')
    && /MoreApps\.!Letters\.!Run %\*0$/.test(boot.rae6 ?? '') && boot.running === 0, boot);

  // ------------------------------------------------ 1. opened by a double-click
  const o1 = await ev(() => window.__run('Rich/odt'));
  ok('a double-click on an ODT starts Letters and opens it: title the leaf with *, imported, no path', o1.open && o1.tasks === 1
    && o1.title === 'Rich/odt *' && o1.format === 'docx' && o1.imported === 'odt' && o1.from === 'RAM::RamDisc0.$.Rich/odt'
    && o1.path === null && o1.dirty === true, o1);
  ok('... its text in the window: heading, bold and italic, list, table cells, footnote anchor, insertion, comment',
    ['Imported heading', 'Some bold and italic text', 'inserted', 'remarked', 'first item', 'second item', 'merged cell', 'cell c', 'cell d', 'a picture']
      .every((s) => o1.text?.includes(s)), o1.text);
  ok('... the one-time notice, as information, with no notes for a clean file', o1.msgs.length === 1 && o1.cats[0] === 'info'
    && o1.msgs[0] === head('Rich/odt', 'an ODT'), o1.msgs);
  const o1b = await ev(() => {
    const d = window.__by('Rich/odt'), m = d.d;
    const kinds = { comments: d.doc.comments?.map?.size };
    const json = JSON.stringify(d.doc);
    return { ...kinds, bold: /"b":true|"bold":true|"b":\{/.test(json), note: /footnote/i.test(json), pic: /image\/png|png/i.test(json),
      ins: /"ins"|insert/i.test(json), merge: /gridSpan|span/i.test(json), num: /numPr|numId/i.test(json) };
  });
  ok('... and the model holds the comment, footnote, picture, tracked insertion, merged cell and list', o1b.comments === 1
    && o1b.note && o1b.pic && o1b.ins && o1b.merge && o1b.num, o1b);

  const o2 = await ev(() => window.__run('Rich/doc'));
  ok('a double-click on a .doc goes to the running Letters (one task) and opens it imported', o2.open && o2.tasks === 1
    && o2.title === 'Rich/doc *' && o2.imported === 'doc' && o2.path === null && o2.dirty === true, o2);
  ok('... its text: heading, bold and italic, list items, table cells, footnote, insertion, comment',
    ['A rich document', 'Bold and italic text', 'item one', 'item two', 'inserted text', 'Section two']
      .every((s) => o2.text?.includes(s)) && /"a"[\s\S]*"b"[\s\S]*"c"[\s\S]*"d"/.test(o2.text ?? ''), o2.text);
  ok('... the notice says a .doc file', o2.msgs.length === 1 && o2.msgs[0].startsWith(head('Rich/doc', 'a .doc')), o2.msgs);

  const o3 = await ev(async () => {
    window.__msgs.length = 0;
    await os.cli.run('Run RAM::RamDisc0.$.Noted/odt');
    await window.__wait(() => window.__by('Noted/odt') && window.__msgs.length);
    await window.__frames(2);
    const d = window.__by('Noted/odt');
    return { open: !!d, msgs: window.__msgs.map((m) => m[0]), tasks: window.__tasks() };
  });
  ok('Run on an ODT with notes (DataOpen &A81 to the running Letters): the notice lists them', o3.open && o3.tasks === 1
    && o3.msgs.length === 1 && o3.msgs[0] === head('Noted/odt', 'an ODT')
      .replace(/\.$/, '. Also: an index or table of contents is kept as plain text; scripts are not read.'), o3);
  await same('opened');

  // ------------------------------------------------ closing and Quit ask
  const c1 = await ev(async () => {
    const d = window.__by('Rich/odt');
    d.requestClose();
    await window.__frames(3);
    return { prompts: window.__prompts().length, leaf: window.__word().word.prompt?.leaf };
  });
  ok('closing an unedited import asks Save / Discard / Cancel', c1.prompts === 1 && c1.leaf === 'Rich/odt', c1);
  await clickButton('Save');
  const c2 = await ev(async () => {
    const d = window.__by('Rich/odt'), b = d.dw.boxes.get('saveas');
    const res = { box: b?.isOpen, name: b?.filename(), type: b?.filetype };
    b.close();
    await window.__frames(3);
    Object.assign(res, { open: d.win.isOpen, title: d.win.title, prompt: window.__word().word.prompt, files: os.vfs.list('RAM::RamDisc0.$').map((f) => f.name) });
    return res;
  });
  ok('... its Save opens the Save box with <leaf>/docx (&A7E), never the original', c2.box && c2.name === 'RAM::RamDisc0.$.Rich/docx'
    && c2.type === 0xA7E, c2);
  ok('... closing the Save box keeps the window, still modified, nothing written', c2.open && c2.title === 'Rich/odt *' && !c2.prompt
    && !c2.files.includes('Rich/docx'), c2);
  const q1 = await ev(async () => {
    const t = window.__word(), res = { mq: 'pending' };
    t.word.mayQuit().then((v) => { res.mq = v; });
    await window.__frames(3);
    const w = window.__prompts().filter((q) => !q.iconByName('button:Save'));
    res.text = w[0] && window.__text(w[0]);
    return res;
  });
  ok('Quit with imports open asks (they count as unsaved changes)', /^\d+ documents have unsaved changes\./.test(q1.text ?? ''), q1);
  await clickButton('Cancel');
  const q2 = await ev(() => ({ alive: !!window.__word(), docs: window.__word()?.word.docs.length }));
  ok('... Cancel keeps Letters and the windows', q2.alive && q2.docs === 3, q2);
  await same('close and Quit');

  // ------------------------------------------------ 2. never over the original
  await ev(() => { window.__by('Rich/odt').dw.view.focus(); return window.__frames(2); });
  await page.keyboard.press('Control+s');
  const s1 = await ev(async () => {
    await window.__frames(3);
    const d = window.__by('Rich/odt'), b = d.dw.boxes.get('saveas');
    return { box: b?.isOpen, name: b?.filename(), type: b?.filetype };
  });
  ok('Ctrl+S on an import opens the Save box with <leaf>/docx, &A7E', s1.box && s1.name === 'RAM::RamDisc0.$.Rich/docx'
    && s1.type === 0xA7E, s1);
  const s2 = await ev(async () => {
    const d = window.__by('Rich/odt'), b = d.dw.boxes.get('saveas');
    window.__msgs.length = 0;
    b.setFilename('RAM::RamDisc0.$.Rich/odt');
    b.emit('click', { icon: b.icons[0], button: 'select' });
    await window.__wait(() => window.__msgs.length && !d.saving);
    await window.__frames(2);
    const res = { msgs: window.__msgs.map((m) => m[0]), replace: [...os.wimp.windows].some((w) => w.isOpen && w.iconByName?.('button:Replace')),
      imported: d.imported, path: d.path, title: d.win.title };
    b.close();
    // the menu's Save: the same box, the same name
    window.__item(d, 'Save').action?.();
    await window.__frames(3);
    res.menu = { box: d.dw.boxes.get('saveas')?.isOpen, name: d.dw.boxes.get('saveas')?.filename() };
    d.dw.boxes.get('saveas').close();
    return res;
  });
  ok('... OK onto the original\'s path is refused in plain words, no Replace question, the window as it was',
    s2.msgs.length === 1 && s2.msgs[0] === "'Rich/odt' is the file this document was opened from: save it under another name, as a .docx."
    && !s2.replace && s2.imported === 'odt' && s2.path === null && s2.title === 'Rich/odt *', s2);
  ok('the menu\'s Save opens the same Save box with <leaf>/docx', s2.menu.box && s2.menu.name === 'RAM::RamDisc0.$.Rich/docx', s2.menu);

  const s3 = await ev(async () => {
    const d = window.__by('Rich/odt');
    const c = window.__item(d, 'Save a copy').submenu();
    const res = { name: c.filename(), type: c.filetype };
    window.__msgs.length = 0;
    c.setFilename('RAM::RamDisc0.$.Rich/odt');
    c.emit('click', { icon: c.icons[0], button: 'select' });
    await window.__wait(() => window.__msgs.length);
    await window.__frames(2);
    res.msgs = window.__msgs.map((m) => m[0]);
    // Export as PDF onto the original: refused
    window.__item(d, 'Export as PDF...').action();
    await window.__frames(2);
    const w = d.dw.boxes.get('pdf');
    w.emit('click', { icon: w.iconByName('button:OK'), button: 'select' });
    await window.__frames(2);
    const s = d.dw.boxes.get('pdfsave');
    res.pdf = { name: s?.filename(), type: s?.filetype };
    window.__msgs.length = 0;
    s.setFilename('RAM::RamDisc0.$.Rich/odt');
    s.emit('click', { icon: s.icons[0], button: 'select' });
    await window.__wait(() => window.__msgs.length);
    res.pdf.msgs = window.__msgs.map((m) => m[0]);
    s.close();
    d.dw.boxes.get('pdf')?.delete?.();
    await window.__frames(2);
    return res;
  });
  ok('Save a copy suggests <leaf>/docx (&A7E) and refuses the original', s3.name === 'RAM::RamDisc0.$.Rich/docx' && s3.type === 0xA7E
    && s3.msgs.length === 1 && /'Rich\/odt' is the file this document was opened from/.test(s3.msgs[0]), s3);
  ok('Export as PDF suggests <leaf>/pdf and refuses the original', s3.pdf.name === 'RAM::RamDisc0.$.Rich/pdf' && s3.pdf.type === 0xADF
    && s3.pdf.msgs.length === 1 && /is this document's own file/.test(s3.pdf.msgs[0]), s3.pdf);
  await same('refused saves');

  // a new name: a .docx, the window a plain .docx window
  const s4 = await ev(async () => {
    const d = window.__by('Rich/odt');
    window.__msgs.length = 0;
    const sv = d.save();
    await window.__frames(2);
    const b = d.dw.boxes.get('saveas');
    b.emit('click', { icon: b.icons[0], button: 'select' });
    const saved = await sv;
    await window.__wait(() => !d.saving);
    const n = window.__by('Rich/docx');
    const st = os.vfs.stat('RAM::RamDisc0.$.Rich/docx');
    return { saved, type: st?.filetype, bytes: st ? Array.from(await os.vfs.readFile('RAM::RamDisc0.$.Rich/docx')) : null,
      now: n && { title: n.win.title, imported: n.imported, from: n.importedFrom, path: n.path, dirty: n.view.dirty, format: n.format },
      keys: window.__word().word.keys, msgs: window.__msgs.map((m) => m[0]) };
  });
  const back = s4.bytes ? await textsOf(s4.bytes) : [];
  ok('Save (the Save box\'s OK on <leaf>/docx) writes a .docx, &A7E, that reads with the text', s4.saved === true && s4.type === 0xA7E
    && ['Imported heading', 'bold', 'merged cell', 'cell d', 'first item'].every((x) => back.includes(x)) && !s4.msgs.length, { ...s4, bytes: null, back });
  ok('... the window is now that .docx: not imported, clean, its title the new leaf, keyed by it', s4.now?.title === 'Rich/docx'
    && s4.now.imported === null && s4.now.from === null && s4.now.path === 'RAM::RamDisc0.$.Rich/docx' && !s4.now.dirty
    && s4.keys.includes('ram::ramdisc0.$.rich/docx') && !s4.keys.includes('ram::ramdisc0.$.rich/odt'), s4);
  const s5 = await ev(async () => {
    const d = window.__by('Rich/docx');
    d.dw.close();
    await window.__frames(2);
    window.__msgs.length = 0;
    await window.__word().word.open('RAM::RamDisc0.$.Rich/docx');
    await window.__wait(() => window.__by('Rich/docx'));
    await window.__frames(3);
    const n = window.__by('Rich/docx');
    n.view.type('More ');
    const saved = await n.save();      // (a plain Save: its own file)
    return { title: n.win.title, imported: n.imported, dirty: n.view.dirty, saved, msgs: window.__msgs.map((m) => m[0]),
      text: n.text, boxes: n.dw.boxes.get('saveas')?.isOpen ?? false };
  });
  ok('... reopened, a plain .docx window: no notice, not modified at first, Save writes its own file', s5.imported === null
    && !s5.msgs.length && s5.saved === true && s5.title === 'Rich/docx' && !s5.dirty && !s5.boxes && /Imported heading/.test(s5.text), s5);
  await same('saved as .docx');

  // the .doc too: Ctrl+S's name, a new name typed
  await ev(() => { window.__by('Rich/doc').dw.view.focus(); return window.__frames(2); });
  await page.keyboard.press('Control+s');
  const s6 = await ev(async () => {
    await window.__frames(3);
    const d = window.__by('Rich/doc'), b = d.dw.boxes.get('saveas');
    const res = { name: b?.filename(), type: b?.filetype };
    b.setFilename('RAM::RamDisc0.$.FromDoc');
    b.emit('click', { icon: b.icons[0], button: 'select' });
    await window.__wait(() => window.__by('FromDoc') && !d.saving);
    const st = os.vfs.stat('RAM::RamDisc0.$.FromDoc');
    res.type2 = st?.filetype;
    res.bytes = st ? Array.from(await os.vfs.readFile('RAM::RamDisc0.$.FromDoc')) : null;
    const n = window.__by('FromDoc');
    res.now = n && { title: n.win.title, imported: n.imported, dirty: n.view.dirty };
    return res;
  });
  const back2 = s6.bytes ? await textsOf(s6.bytes) : [];
  ok('a .doc: Ctrl+S suggests Rich2/docx (Rich/docx is there now); a typed name writes a .docx (&A7E) with its text', s6.name === 'RAM::RamDisc0.$.Rich2/docx'
    && s6.type === 0xA7E && s6.type2 === 0xA7E && ['A rich document', 'item two', 'Section two'].every((x) => back2.includes(x)) && s6.now?.title === 'FromDoc'
    && s6.now.imported === null && !s6.now.dirty, { ...s6, bytes: null, back2 });
  await same('the .doc saved');

  // ------------------------------------------------ 3. Revert; Save as offers .docx or RTF
  const v1 = await ev(async () => {
    window.__msgs.length = 0;
    await window.__word().word.open('RAM::RamDisc0.$.Plain/doc');
    await window.__wait(() => window.__by('Plain/doc'));
    await window.__frames(2);
    const d = window.__by('Plain/doc');
    const it = window.__item(d, 'Revert');
    const shaded = typeof it.shaded === 'function' ? it.shaded(it) : it.shaded;
    window.__queries.length = 0;
    d.view.type('Edit ');
    window.__answer = 'Cancel';
    const kept = await d.revert();
    const res = { shaded, kept, asked: window.__queries.at(-1), text1: window.__by('Plain/doc').text };
    window.__answer = 'Discard';
    window.__msgs.length = 0;
    res.done = await d.revert();
    await window.__frames(3);
    const n = window.__by('Plain/doc');
    Object.assign(res, { fresh: n !== d, text2: n?.text, imported: n?.imported, from: n?.importedFrom, title: n?.win.title,
      dirty: n?.view.dirty, msgs: window.__msgs.map((m) => m[0]) });
    return res;
  });
  ok('Revert on an import is enabled; with an edit it asks Discard / Cancel, Cancel keeps the edit', v1.shaded === false && v1.kept === false
    && /Plain\/doc/.test(v1.asked?.message ?? '') && JSON.stringify(v1.asked?.buttons) === '["Discard","Cancel"]'
    && /^Edit Plain doc text\./.test(v1.text1 ?? ''), v1);
  // (final review: the box says again where it came from, as on opening)
  ok('... Discard reads the original again: the edit gone, still imported from it, still modified, the opening notice again',
    v1.done === true && v1.fresh && /^Plain doc text\./.test(v1.text2 ?? '') && v1.imported === 'doc'
    && v1.from === 'RAM::RamDisc0.$.Plain/doc' && v1.title === 'Plain/doc *' && v1.dirty
    && JSON.stringify(v1.msgs) === JSON.stringify(["'Plain/doc' was opened from a .doc file; it will be saved as a .docx."]), v1);
  const a1 = await ev(async () => {
    const d = window.__by('Noted/odt');
    const a = d.saveAsBox(), w = a.win;
    const res = { format: a.get('format') };
    a.set('format', 'rtf');
    w.emit('click', { icon: w.iconByName('button:Continue'), button: 'select' });
    await window.__frames(3);
    const b = d.saveBox();
    res.box = { open: b.isOpen, name: b.filename(), type: b.filetype };
    res.lost = [...os.wimp.windows].some((q) => q.isOpen && q.title === 'Save as RTF');
    b.close();
    await window.__frames(2);
    return res;
  });
  ok('Save as on an import: .docx chosen; RTF and Continue give the Save box <leaf>/rtf with &C32 (nothing lost: no question)',
    a1.format === 'docx' && a1.box.open && a1.box.name === 'RAM::RamDisc0.$.Noted/rtf' && a1.box.type === 0xC32 && !a1.lost, a1);
  const a2 = await ev(async () => {
    await window.__word().word.open('RAM::RamDisc0.$.Rich/odt');
    await window.__wait(() => window.__by('Rich/odt'));
    await window.__frames(2);
    const d = window.__by('Rich/odt');
    const a = d.saveAsBox(), w = a.win;
    a.set('format', 'rtf');
    w.emit('click', { icon: w.iconByName('button:Continue'), button: 'select' });
    await window.__frames(3);
    const lost = [...os.wimp.windows].some((x) => x.isOpen && x.title === 'Save as RTF');
    const b = d.saveBox();
    const res = { lost, name: b.filename(), type: b.filetype };
    b.emit('click', { icon: b.icons[0], button: 'select' });
    await window.__wait(() => window.__by('Rich/rtf') && !d.saving);
    const st = os.vfs.stat('RAM::RamDisc0.$.Rich/rtf');
    const bytes = st ? await os.vfs.readFile('RAM::RamDisc0.$.Rich/rtf') : new Uint8Array(0);
    const n = window.__by('Rich/rtf');
    Object.assign(res, { ftype: st?.filetype, head: String.fromCharCode(...bytes.slice(0, 6)),
      body: /Imported heading/.test(String.fromCharCode(...bytes)), now: n && { format: n.format, imported: n.imported, dirty: n.view.dirty } });
    return res;
  });
  // (what the readers make RTF holds all of: no Save as RTF question, as for a .docx with nothing lost)
  ok('... the rich ODT saved as RTF: the Save box <leaf>/rtf, an RTF file (&C32); the window RTF from then on, no longer imported',
    !a2.lost && a2.name === 'RAM::RamDisc0.$.Rich/rtf' && a2.type === 0xC32 && a2.ftype === 0xC32 && a2.head === '{\\rtf1' && a2.body
    && a2.now?.format === 'rtf' && a2.now.imported === null && !a2.now.dirty, a2);
  // (an import holding what RTF cannot store: Save as RTF asks first, as for a .docx)
  const a3 = await ev(async () => {
    await window.__word().word.open('RAM::RamDisc0.$.Gif/odt');
    await window.__wait(() => window.__by('Gif/odt'));
    await window.__frames(2);
    const d = window.__by('Gif/odt');
    const ask = async (button) => {
      const a = d.saveAsBox(), w = a.win;
      a.set('format', 'rtf');
      w.emit('click', { icon: w.iconByName('button:Continue'), button: 'select' });
      const q = await window.__wait(() => [...os.wimp.windows].find((x) => x.isOpen && x.title === 'Save as RTF'));
      const r = { asked: !!q, text: q ? window.__text(q) : '', box: d.dw.boxes.get('saveas')?.isOpen ?? false };
      if (q) q.emit('click', { icon: q.iconByName('button:' + button), button: 'select' });
      await window.__frames(3);
      const b = d.dw.boxes.get('saveas');
      Object.assign(r, { after: !!b?.isOpen, name: b?.isOpen ? b.filename() : null, type: b?.isOpen ? b.filetype : null });
      if (b?.isOpen) b.close();
      await window.__frames(2);
      return r;
    };
    const cancel = await ask('Cancel');
    const go = await ask('Continue');
    return { cancel, go, gif: /image\/gif|gif/i.test(JSON.stringify(d.doc)), imported: d.imported, path: d.path,
      files: os.vfs.list('RAM::RamDisc0.$').map((f) => f.name).filter((n) => /^Gif/.test(n)) };
  });
  ok('an import with a GIF: Save as RTF asks first, "1 item can\'t be stored in RTF: pictures (1).", no Save box yet',
    a3.gif && a3.cancel.asked && !a3.cancel.box && a3.cancel.text.includes("1 item can't be stored in RTF: pictures (1).")
    && a3.cancel.text.includes('Cancel saves nothing.'), a3);
  ok('... Cancel: no Save box, nothing written, still imported; Continue: the Save box <leaf>/rtf (&C32)',
    !a3.cancel.after && a3.go.asked && a3.go.after && a3.go.name === 'RAM::RamDisc0.$.Gif/rtf' && a3.go.type === 0xC32
    && a3.imported === 'odt' && a3.path === null && JSON.stringify(a3.files) === '["Gif/odt"]', a3);
  await same('Revert and Save as');

  // ------------------------------------------------ 4. two imports, independent; the same file twice
  const w1 = await ev(async () => {
    const t = window.__word().word;
    await t.open('RAM::RamDisc0.$.Second/odt');
    await window.__wait(() => window.__by('Second/odt'));
    const a = window.__by('Plain/doc'), b = window.__by('Second/odt');
    const before = b.text;
    a.view.type('Only here ');
    a.win.bringToFront();
    await window.__frames(2);
    const S = os.wimp.stack, n = t.docs.length, under = S.indexOf(b.win) < S.indexOf(a.win);
    const again = await t.open('RAM::RamDisc0.$.Second/odt');
    await window.__frames(2);
    const res = { aText: window.__by('Plain/doc').text, bText: window.__by('Second/odt').text, before, n, after: t.docs.length,
      raised: again === b.dw, top: under && S.indexOf(b.win) > S.indexOf(a.win) };
    for (const [leaf, name] of [['Plain/doc', 'Plain/docx'], ['Second/odt', 'Second/docx']]) {
      const d = window.__by(leaf), sv = d.save();
      await window.__frames(2);
      const box = d.dw.boxes.get('saveas');
      res[leaf] = box.filename();
      box.emit('click', { icon: box.icons[0], button: 'select' });
      await sv;
      await window.__wait(() => window.__by(name));
    }
    res.files = {};
    for (const f of ['Plain/docx', 'Second/docx']) res.files[f] = Array.from(await os.vfs.readFile('RAM::RamDisc0.$.' + f));
    return res;
  });
  const pd = await textsOf(w1.files['Plain/docx']), sd = await textsOf(w1.files['Second/docx']);
  ok('two imports in two windows: an edit in one leaves the other as it was', /^Only here Plain doc text\./.test(w1.aText ?? '')
    && JSON.stringify(w1.bText) === JSON.stringify(w1.before) && /Second ODT text\./.test(w1.bText ?? ''), { ...w1, files: null });
  ok('opening the same ODT again raises its window (over the other), no second one', w1.raised && w1.n === w1.after && w1.top, { ...w1, files: null });
  ok('... each saves to its own name, with its own text', w1['Plain/doc'] === 'RAM::RamDisc0.$.Plain/docx'
    && w1['Second/odt'] === 'RAM::RamDisc0.$.Second/docx' && pd.includes('"Only here Plain doc text."') && sd.includes('"Second ODT text."') && !pd.includes('Second') && !sd.includes('Plain'), { pd, sd });
  await same('two imports');

  // ------------------------------------------------ 5, 7. refused files: plain words, no window
  const N = (leaf, why) => `'${leaf}' could not be opened: ${why}.`;
  const REFUSED = {
    'Old/doc': N('Old/doc', 'it is a Word 6/95 file, which !Letters cannot read'),
    'Locked/doc': N('Locked/doc', 'it is password-protected'),
    'Cut/doc': N('Cut/doc', 'the file is damaged'),
    'Sheet/doc': N('Sheet/doc', 'it is not a Word document'),
    'Sheet/odt': N('Sheet/odt', 'it is not an OpenDocument text file'),
    'One/doc': N('One/doc', 'it is not a Word document'),
    'Empty/odt': N('Empty/odt', 'it is not an OpenDocument text file'),
    'Junk/doc': N('Junk/doc', 'it is not a Word document'),
    'Junk/odt': N('Junk/odt', 'it is not an OpenDocument text file'),
  };
  const f1 = await ev(async (leaves) => {
    const res = {};
    for (const leaf of leaves) res[leaf] = await window.__run(leaf);
    res.alive = !!window.__word();
    return res;
  }, Object.keys(REFUSED));
  for (const [leaf, msg] of Object.entries(REFUSED)) {
    const g = f1[leaf];
    ok(`${leaf} (&${leaf.endsWith('odt') ? 'A81' : 'AE6'}) refused: "${msg}", no window`, !g.open && g.msgs.length === 1
      && g.msgs[0] === msg && g.cats[0] !== 'info', g);
  }
  await same('refused files');
  const f2 = await ev(async () => {
    const res = {};
    for (const leaf of ['Disguise/odt', 'Rtf/doc', 'Odt/docx']) res[leaf] = await window.__run(leaf);
    const d = window.__by('Disguise/odt');
    d.view.type('Still works ');
    res.typed = window.__by('Disguise/odt').text;
    return res;
  });
  const g1 = f2['Disguise/odt'], g2 = f2['Rtf/doc'], g3 = f2['Odt/docx'];
  ok('a .docx with an ODT\'s type opens as a .docx (by content): not imported, no notice', g1.open && g1.format === 'docx'
    && g1.imported === null && g1.path === 'RAM::RamDisc0.$.Disguise/odt' && !g1.msgs.length && /A docx called odt\./.test(g1.text ?? ''), g1);
  ok('RTF with a .doc\'s type opens as RTF', g2.open && g2.format === 'rtf' && g2.imported === null && /RTF called doc\./.test(g2.text ?? '')
    && !g2.msgs.length, g2);
  ok('an ODT with a .docx\'s type opens as an imported ODT', g3.open && g3.imported === 'odt' && g3.path === null
    && g3.msgs[0] === head('Odt/docx', 'an ODT'), g3);
  ok('the desktop and Letters carry on after the refusals', f1.alive && /^Still works A docx/.test(f2.typed ?? ''), f2.typed);
  await same('files opened by content');

  // ------------------------------------------------ 8. Print and Export as PDF of an import
  const x1 = await ev(async () => {
    const d = window.__by('Noted/odt');
    const items = d.win.menu({}).items.map((i) => i.text);
    window.__msgs.length = 0;
    window.__item(d, 'Print...').action();
    await window.__frames(3);
    const res = { items, print: window.__msgs.map((m) => m[0]), box: !!d.dw.boxes.get('print') };
    window.__item(d, 'Export as PDF...').action();
    await window.__frames(2);
    const w = d.dw.boxes.get('pdf');
    w.emit('click', { icon: w.iconByName('button:OK'), button: 'select' });
    await window.__frames(2);
    const s = d.dw.boxes.get('pdfsave');
    res.name = s.filename();
    s.setFilename('RAM::RamDisc0.$.Noted/pdf');
    s.emit('click', { icon: s.icons[0], button: 'select' });
    await window.__wait(() => os.vfs.exists('RAM::RamDisc0.$.Noted/pdf'), 400);
    await window.__frames(2);
    const st = os.vfs.stat('RAM::RamDisc0.$.Noted/pdf');
    const b = st ? await os.vfs.readFile('RAM::RamDisc0.$.Noted/pdf') : new Uint8Array(0);
    Object.assign(res, { type: st?.filetype, head: String.fromCharCode(...b.slice(0, 5)), imported: d.imported, title: d.win.title });
    return res;
  });
  ok('an import\'s menu has Print... and Export as PDF...; Print without !Printers says there is no printer driver',
    x1.items.includes('Print...') && x1.items.includes('Export as PDF...') && x1.print.length === 1 && /no printer driver/.test(x1.print[0])
    && !x1.box, x1);
  ok('Export as PDF of an import writes a PDF (&ADF) beside it, the window still imported', x1.name === 'RAM::RamDisc0.$.Noted/pdf'
    && x1.type === 0xADF && x1.head === '%PDF-' && x1.imported === 'odt' && x1.title === 'Noted/odt *', x1);
  await same('Print and PDF');

  // ------------------------------------------------ 5. dropped on the icon bar icon, dropped on a document window
  const drops = await ev(async ([D, ODT, DOC]) => {
    os.vfs.writeFile(D + 'Words', new TextEncoder().encode('plain text, not Word'), { filetype: 0xFFF });
    const it = () => os.wimp.iconbar.items.find((i) => i.task?.name === 'Letters');
    const file = (leaf, filetype) => ({ path: D + leaf, filetype, type: 'file' });
    const res = {};
    const step = async (key, leaf, how) => {
      window.__msgs.length = 0;
      const n = window.__word().word.docs.filter((d) => !d.closed).length;
      how([file(leaf, leaf.endsWith('odt') ? ODT : DOC)]);
      await window.__wait(() => window.__by(leaf) || window.__msgs.length);
      await window.__frames(3);
      const d = window.__by(leaf);
      res[key] = { open: !!d, title: d?.win.title, imported: d?.imported ?? null, from: d?.importedFrom ?? null, path: d?.path ?? null,
        text: d?.text, n, after: window.__word().word.docs.filter((q) => !q.closed).length, msgs: window.__msgs.map((m) => m[0]),
        tasks: window.__tasks() };
    };
    const onBar = (files) => it().onDataLoad({ files });
    const keep = () => window.__word().word.docs.find((q) => !q.closed);
    const onWin = (files) => keep().win.emit('dataload', { files, x: 50, y: -50, icon: -1, window: keep().win });
    await step('barOdt', 'DropA/odt', onBar);
    await step('barOdt2', 'DropB/odt', onBar);
    await step('barDoc', 'DropC/doc', onBar);
    await step('winDoc', 'DropD/doc', onWin);
    await step('winOdt', 'DropE/odt', onWin);
    // refused: a missing file, and a text file (not Word), each on its
    // own, on the icon and on a window: one message each, no window
    for (const [key, how] of [['bar', onBar], ['win', onWin]]) {
      for (const [what, leaf, type] of [['Missing', 'Nothing/odt', ODT], ['Text', 'Words', 0xFFF]]) {
        window.__msgs.length = 0;
        const n = window.__word().word.docs.filter((q) => !q.closed).length;
        let threw = null;
        try {
          how([file(leaf, type)]);
          await window.__sleep(300);
          await window.__frames(3);
        } catch (e) { threw = String(e); }
        res['bad' + what + key] = { threw, msgs: window.__msgs.map((m) => m[0]), none: !window.__by(leaf),
          same: window.__word().word.docs.filter((q) => !q.closed).length === n, alive: window.__tasks() === 1, leaf };
      }
    }
    return res;
  }, [D, ODT, DOC]);
  const dropOk = (d, leaf, text, more) => d.open && d.title === leaf + ' *' && d.imported === (leaf.endsWith('odt') ? 'odt' : 'doc')
    && d.from === D + leaf && d.path === null && d.text.includes(text) && d.after === d.n + 1 && d.tasks === 1 && more;
  ok('an ODT dropped on the icon bar icon opens as an import', dropOk(drops.barOdt, 'DropA/odt', 'Dropped A.', true), drops.barOdt);
  ok('... a second ODT dropped there opens a second window', dropOk(drops.barOdt2, 'DropB/odt', 'Dropped B.', true), drops.barOdt2);
  ok('a .doc dropped on the icon bar icon opens as an import', dropOk(drops.barDoc, 'DropC/doc', 'Dropped C.', true), drops.barDoc);
  ok('a .doc dropped on a document window opens as an import in a window of its own', dropOk(drops.winDoc, 'DropD/doc', 'Dropped D.', true), drops.winDoc);
  ok('an ODT dropped on a document window opens as an import, a second window', dropOk(drops.winOdt, 'DropE/odt', 'Dropped E.', drops.winOdt.after === drops.winDoc.after + 1), drops.winOdt);
  const badOk = (d, why) => !d.threw && d.msgs.length === 1 && d.msgs[0].includes("'" + d.leaf + "' could not be opened")
    && why.test(d.msgs[0]) && d.none && d.same && d.alive;
  for (const where of ['bar', 'win']) {
    const on = where === 'bar' ? 'the icon bar icon' : 'a document window';
    ok(`a missing file dropped on ${on}: exactly one message, 'could not be opened' and why, no window`,
      badOk(drops['badMissing' + where], /could not be opened: .+/), drops['badMissing' + where]);
    ok(`a text file dropped on ${on}: exactly one message, 'could not be opened' and why, no window`,
      badOk(drops['badText' + where], /could not be opened: .+/), drops['badText' + where]);
  }
  await same('Drops');
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
console.log(`${out.filter((l) => l.startsWith('PASS')).length} PASS, ${out.filter((l) => l.startsWith('FAIL')).length} FAIL, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
