// !Letters' Table of Contents box in the real desktop (Batch E3). A
// document with an empty first paragraph, three headings (levels 1,
// 2, 3) and a Quote paragraph. Insert > Table of Contents... opens
// the box with Word's defaults (3 levels, page numbers right aligned
// with dots, hyperlinks, outline levels), Remove shaded; Cancel
// changes nothing; Insert puts in TOC \o "1-3" \h \z \u with three
// entries (one undo step). With the caret in the table the box edits
// it: its button reads Update, Remove is live; Show levels 2 and
// Update: two entries (one step); Ctrl+Z gives three back. The caret
// moved while the box is open: the button beeps, refills and says
// so. Return presses Update; Escape closes and gives the caret back.
// Options...: Quote at level 2, Set, OK, Update: \t "Quote,2" and
// the Quote entry. Edit > Update field in the table asks which update
// (Update page numbers only first); Update entire table after a
// heading was renamed: the new text (one step); page numbers only
// then changes nothing (no step); Cancel changes nothing. Options
// Cancel drops its change; its OK after the parent box refilled is
// refused. The choice opened by the Field box: its first Cancel says
// the code was changed. A range over the table and a SEQ field:
// Update field makes both, no choice (one step). The Field box's OK
// on the table's code opens that choice with Update entire table.
// Remove takes the table out (one step); Ctrl+Z puts it back. In the
// header and footer mode the menu item is shaded (Edit > Update all
// fields too) and the box's
// Insert is refused with a message. Insert > Caption...: Figure below
// Said ("Figure 1 A cat", the later caption renumbered, one step),
// Ctrl+Z; New Label... refuses a quote and keeps Plate in the
// choices; Plate above; Numbering... ROMAN. Caption... is shaded in
// the header and footer mode. Insert > Cross-reference...: a
// heading's text as REF _Ref... \h (one step, Ctrl+Z); its target
// deleted while the box is open: Insert says so; a caption's label
// and number (Include above/below shaded); shaded in a field's
// code, live in the header and footer mode. Insert > Table of
// Figures...: TOC \h \z \c "Figure" (one step); Table of
// Contents... in it opens that box; Remove. Edit > Update all fields:
// one message with the count (again: no step); in Outline the message
// says page numbers need Print layout. Closing the window
// deletes the boxes. Needs the disc built by tools/disc-wimplib.mjs and
// disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { buildDocx, documentXml, stylesXml, p, r } from './build-docx.mjs';
import { fld } from './field-fixtures.mjs';

const sty = (id, name, inner = '', based = '') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>`
  + (based ? `<w:basedOn w:val="${based}"/>` : '') + `<w:pPr>${inner}</w:pPr></w:style>`;
const OL = (n) => `<w:outlineLvl w:val="${n}"/>`;
const STYLES = stylesXml(sty('Normal', 'Normal') + sty('Heading1', 'heading 1', OL(0), 'Normal')
  + sty('Heading2', 'heading 2', OL(1), 'Normal') + sty('Heading3', 'heading 3', OL(2), 'Normal')
  + sty('Quote', 'Quote', '', 'Normal'));
const H = (n, t) => p(r(t), `<w:pStyle w:val="Heading${n}"/>`);
const bytes = await buildDocx({
  'word/document.xml': documentXml(p('') + H(1, 'One') + p(r('Body text.')) + H(2, 'Two') + H(3, 'Three')
    + p(r('Said'), '<w:pStyle w:val="Quote"/>') + p(r('Figure ') + fld('SEQ Figure', '7'))),
  'word/styles.xml': STYLES,
});
const files = { Toc: Array.from(bytes) };

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);

const { browser, page, logs } = await launch({ height: 1000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev(async (files) => {
    window.__msgs = [];
    const rec = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    globalThis.__riscos.reportError = rec;
    os.wimp.reportError = rec;
    window.__beeps = 0;
    const beep = os.wimp.beep.bind(os.wimp);
    os.wimp.beep = (...a) => { window.__beeps++; return beep(...a); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__doc = () => window.__word()?.word.docs.find((d) => d.leaf === 'Toc');
    window.__menu = (d, ...names) => {
      let items = d.win.menu({}).items, it = null;
      for (const n of names) {
        it = items.find((i) => i.text === n);
        if (!it) return null;
        if (it.submenu) items = it.submenu().items;
      }
      return it;
    };
    window.__shaded = (it) => (typeof it.shaded === 'function' ? it.shaded(it) : !!it.shaded);
    window.__box = (key) => {
      // (only a box the window has: asking Dialog for another would make an empty one)
      const d = window.__doc();
      return d.dw.boxes.has(key) ? window.__word().word.dialog({ key: key + ':' + d.dw.docKey, rows: [] }) : null;
    };
    const nodeText = (n) => (typeof n === 'string' ? n : n && Array.isArray(n.children)
      ? (/:(instrText|delText)$/.test(n.name) ? '' : /:tab$/.test(n.name) ? '\t' : n.children.map(nodeText).join('')) : '');
    /** A paragraph's text, a kept inline's (a link's) text included. */
    window.__plain = (b) => [...b.text].map((c, k) => (c !== '\ufffc' ? c
      : b.inlines && b.inlines[k] && b.inlines[k].node && /hyperlink$/.test(b.inlines[k].node.name)
        ? nodeText(b.inlines[k].node) : '')).join('');
    /** The window's TOC: instruction, entry texts, undo depth. */
    window.__toc = () => {
      const d = window.__doc(), doc = d.dw.doc, bs = doc.sections[0].blocks;
      let instr = null;
      const ps = bs.map((b) => (b.type === 'p' ? window.__plain(b) : ''));
      const i = bs.findIndex((b) => b.type === 'p' && Object.values(b.inlines || {}).some((x) => x.node
        && /instrText$/.test(x.node.name) && /TOC/.test(x.node.children.join(''))));
      if (i >= 0) {
        const x = Object.values(bs[i].inlines).find((y) => y.node && /instrText$/.test(y.node.name));
        instr = x.node.children.join('').trim();
      }
      const toc = bs.filter((b) => b.type === 'p' && /^TOC/i.test(b.pStyle || '')).map((b) => window.__plain(b)
        .replace(/\s+\d+$/, '').trim());
      return { instr, toc, depth: d.d.undoDepth, ps };
    };
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    await window.__word().word.recentReady;
    await window.__word().word.open('RAM::RamDisc0.$.Toc');
    await window.__frames(4);
  }, files);

  const settle = () => ev(() => window.__frames(4));
  const press = async (k) => { await page.keyboard.press(k); await settle(); };
  const toc = () => ev(() => window.__toc());
  const caretAt = (k, off = 0) => ev(async ([k, off]) => {
    const d = window.__doc(), v = d.dw.view, b = d.dw.doc.sections[0].blocks[k];
    v.setSelection({ anchor: { id: b.id, off }, head: { id: b.id, off }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  }, [k, off]);
  /** The caret just after the TOC's separate (in its first entry). */
  const caretInToc = (k = 1) => ev(async (k) => {
    const d = window.__doc(), v = d.dw.view, b = d.dw.doc.sections[0].blocks.filter((x) => /^TOC/i.test(x.pStyle || ''))[k - 1];
    v.setSelection({ anchor: { id: b.id, off: b.text.length - 1 }, head: { id: b.id, off: b.text.length - 1 }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  }, k);
  const menuItem = (...names) => ev((names) => {
    const it = window.__menu(window.__doc(), ...names);
    return it ? { text: it.text, shaded: window.__shaded(it) } : null;
  }, names);
  const runMenu = (...names) => ev(async (names) => {
    const it = window.__menu(window.__doc(), ...names);
    if (!it || window.__shaded(it)) return false;
    it.action(it);
    await window.__frames(3);
    return true;
  }, names);
  const B = (key) => ({
    get: () => ev((key) => {
      const d = window.__doc();
      if (!d.dw.boxes.has(key)) return null;
      const b = window.__box(key);
      if (!b.isOpen) return null;
      const I = (n) => b.win.iconByName(n);
      return { ...b.values(), insertText: I('button:Insert')?.text, removeShaded: I('button:Remove')?.shaded,
        leaderShaded: I('leader')?.shaded, title: b.win.title };
    }, key),
    set: (name, v) => ev(([key, n, x]) => { window.__box(key).set(n, x); }, [key, name, v]),
    click: async (name) => {
      const c = await ev(([key, n]) => {
        const b = window.__box(key);
        const ic = b.win.iconByName(/^[A-Z]/.test(n) ? 'button:' + n : n), bb = ic.bbox;
        const s = b.win.workToScreen((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2);
        const rc = os.wimp.screen.getBoundingClientRect(), k = os.wimp.scale;
        return { x: rc.left + s.x * k, y: rc.top + s.y * k };
      }, [key, name]);
      await page.mouse.click(c.x, c.y);
      await settle();
    },
  });
  const TB = B('toc'), OB = B('tocopts'), UB = B('tocupdate');
  const beeps = () => ev(() => window.__beeps);

  // the menu item and the box's defaults
  await caretAt(0);
  const t0 = await toc();
  const mi = await menuItem('Insert', 'Table of Contents...');
  ok('Insert > Table of Contents... is there, not shaded', mi && !mi.shaded, mi);
  await runMenu('Insert', 'Table of Contents...');
  const b1 = await TB.get();
  ok('the box opens with Word\'s defaults; Insert, Remove shaded', b1 && b1.levels === 3 && b1.pageNumbers === true
    && b1.rightAlign === true && b1.leader === 'dots' && b1.hyperlinks === true && b1.outline === true
    && b1.insertText === 'Insert' && b1.removeShaded === true, b1);
  await TB.click('Cancel');
  const t1 = await toc();
  ok('Cancel closes it and changes nothing', !(await TB.get()) && t1.depth === t0.depth && t1.instr === null, t1);

  // Insert
  await runMenu('Insert', 'Table of Contents...');
  await TB.click('Insert');
  const t2 = await toc();
  ok('Insert: TOC \\o "1-3" \\h \\z \\u, three entries, one undo step, box gone', !(await TB.get())
    && t2.instr === 'TOC \\o "1-3" \\h \\z \\u' && JSON.stringify(t2.toc) === '["One","Two","Three"]'
    && t2.depth === t0.depth + 1, t2);

  // the box on the table: Update
  await caretInToc(1);
  const mi2 = await menuItem('Insert', 'Table of Contents...');
  ok('in the table the menu item is live', mi2 && !mi2.shaded, mi2);
  await runMenu('Insert', 'Table of Contents...');
  const b2 = await TB.get();
  ok('with the caret in the table: the button reads Update, Remove live, the table\'s values', b2
    && b2.insertText === 'Update' && b2.removeShaded === false && b2.levels === 3 && b2.leader === 'dots', b2);
  await TB.set('levels', 2);
  await TB.click('Insert');
  const t3 = await toc();
  ok('Show levels 2 and Update: \\o "1-2", two entries, one step', !(await TB.get())
    && t3.instr === 'TOC \\o "1-2" \\h \\z \\u' && JSON.stringify(t3.toc) === '["One","Two"]'
    && t3.depth === t2.depth + 1, t3);
  await press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  const t4 = await toc();
  ok('Ctrl+Z: three entries again', t4.instr === 'TOC \\o "1-3" \\h \\z \\u' && t4.toc.length === 3
    && t4.depth === t2.depth, t4);

  // stale: the caret moved while the box was open
  await caretInToc(1);
  await runMenu('Insert', 'Table of Contents...');
  await TB.set('levels', 1);
  await caretInToc(2);
  const bp0 = await beeps();
  await TB.click('Insert');
  const b3 = await TB.get(), t5 = await toc();
  ok('the caret moved while the box was open: a beep, refilled (the changed field kept), said so, nothing written',
    b3 && /changed while the box was open/.test(b3.msg) && b3.levels === 1 && (await beeps()) === bp0 + 1
      && t5.depth === t4.depth, { b3, t5 });
  // Return presses Update
  await ev(() => { const b = window.__box('toc'); b.focus('levels'); });
  await press('Enter');
  const t6 = await toc();
  ok('Return presses Update: \\o "1-1", one entry', !(await TB.get()) && t6.instr === 'TOC \\o "1-1" \\h \\z \\u'
    && JSON.stringify(t6.toc) === '["One"]' && t6.depth === t5.depth + 1, t6);
  await press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');

  // Escape
  await caretInToc(1);
  await runMenu('Insert', 'Table of Contents...');
  await ev(() => { window.__box('toc').focus('levels'); });
  await press('Escape');
  const esc = await ev(() => ({ gone: !window.__box('toc')?.isOpen, caret: os.wimp.caret?.window === window.__doc().dw.win }));
  ok('Escape closes the box and gives the caret back', esc.gone && esc.caret, esc);

  // Options...: Quote at level 2
  await caretInToc(1);
  const om = await runMenu('Insert', 'Table of Contents...');
  await TB.click('options');
  const o1 = await OB.get();
  ok('Options... opens the Options box with the document\'s styles', o1 && typeof o1.style === 'string', { om, o1 });
  await OB.set('style', 'Quote');
  await OB.set('level', 2);
  await OB.click('set');
  const o2 = await OB.get();
  ok('Set: the list shows Quote 2', o2 && /Quote 2/.test(o2.list), o2);
  await OB.click('OK');
  const b4 = await TB.get();
  ok('OK: the Options box goes, the Table of Contents box says so', !(await OB.get()) && b4 && /Quote 2/.test(b4.msg), b4);
  const t7a = await toc();
  await TB.click('Insert');
  const t7 = await toc();
  ok('Update: \\t "Quote,2" and the Quote entry, one step', t7.instr === 'TOC \\o "1-3" \\h \\z \\t "Quote,2" \\u'
    && JSON.stringify(t7.toc) === '["One","Two","Three","Said"]' && t7.depth === t7a.depth + 1, t7);

  // Options Cancel: the change dropped
  await caretInToc(1);
  await runMenu('Insert', 'Table of Contents...');
  await TB.click('options');
  await OB.set('style', 'Quote');
  await OB.set('level', 3);
  await OB.click('set');
  await OB.click('Cancel');
  const b6 = await TB.get();
  ok('Options Cancel: the box goes, the list is not kept', !(await OB.get()) && b6 && !/Quote 3/.test(b6.msg + b6.msg2), b6);
  // the Options box is refused once the parent box was filled again
  await TB.click('options');
  await runMenu('Insert', 'Table of Contents...');
  const oc = await OB.get();
  await ev(() => { window.__box('tocopts').open(); });
  await settle();
  const bp2 = await beeps();
  await OB.click('OK');
  const o3 = await OB.get();
  ok('the parent filled again: the Options box closed with it; its OK later is refused with a beep', !oc && o3
    && /filled again/.test(o3.msg) && (await beeps()) === bp2 + 1, { oc, o3 });
  await OB.click('Cancel');
  await TB.click('Cancel');
  const t7b = await toc();
  ok('... and nothing written', t7b.depth === t7.depth && t7b.instr === t7.instr, t7b);

  // Edit > Update field on the table: the choice
  await ev(async () => {
    const d = window.__doc(), v = d.dw.view, b = d.dw.doc.sections[0].blocks.find((x) => window.__plain(x) === 'Two'
      && /^Heading/.test(x.pStyle || ''));
    const k = b.text.indexOf('Two');
    v.setSelection({ anchor: { id: b.id, off: k + 3 }, head: { id: b.id, off: k + 3 }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  });
  await page.keyboard.type('X');
  await settle();
  await caretInToc(1);
  const t8a = await toc();
  await runMenu('Edit', 'Update field');
  const u1 = await UB.get();
  ok('Edit > Update field in the table asks: Update page numbers only first', u1 && u1.what === 'pages', u1);
  await UB.set('what', 'entire');
  await UB.click('OK');
  const t8 = await toc();
  ok('Update entire table: the renamed heading\'s new text, one step', !(await UB.get())
    && t8.toc.includes('TwoX') && t8.depth === t8a.depth + 1, t8);
  await caretInToc(1);
  await runMenu('Edit', 'Update field');
  await UB.click('OK');
  const t8b = await toc();
  ok('Update page numbers only: the entries kept, the box gone (no change: no step)', !(await UB.get())
    && JSON.stringify(t8b.toc) === JSON.stringify(t8.toc) && t8b.depth === t8.depth, t8b);
  await caretInToc(1);
  await runMenu('Edit', 'Update field');
  await UB.click('Cancel');
  const t9 = await toc();
  ok('Cancel in the choice changes nothing', !(await UB.get()) && t9.depth === t8.depth, t9);

  // the Field box on the table's code
  await ev(async () => {
    const d = window.__doc(), v = d.dw.view, bs = d.dw.doc.sections[0].blocks;
    const b = bs.find((x) => Object.values(x.inlines || {}).some((y) => y.node && /instrText$/.test(y.node.name)));
    const k = Number(Object.keys(b.inlines).find((j) => b.inlines[j].node && /instrText$/.test(b.inlines[j].node.name)));
    v.setSelection({ anchor: { id: b.id, off: k }, head: { id: b.id, off: k }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  });
  await runMenu('Insert', 'Field...');
  await B('field').click('OK');
  const u2 = await UB.get();
  ok('the Field box\'s OK on the table\'s code asks which update, Update entire table chosen', u2 && u2.what === 'entire', u2);
  await UB.click('Cancel');
  const u3 = await UB.get();
  ok('its first Cancel says the code was changed and the entries are as they were, the box kept', u3
    && /code was changed/.test(u3.msg + ' ' + u3.msg2), u3);
  await UB.click('Cancel');
  ok('a second Cancel closes it', !(await UB.get()));

  // a range over the table and a SEQ field (Select all): no choice, both updated
  await ev(async () => {
    const d = window.__doc(), v = d.dw.view, bs = d.dw.doc.sections[0].blocks;
    const b = bs.find((x) => window.__plain(x) === 'TwoX' && /^Heading/.test(x.pStyle || ''));
    const k = b.text.indexOf('TwoX') + 4;
    v.setSelection({ anchor: { id: b.id, off: k }, head: { id: b.id, off: k }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  });
  await page.keyboard.type('Y');
  await settle();
  const t9a = await ev(async () => {
    const d = window.__doc(), v = d.dw.view, bs = d.dw.doc.sections[0].blocks, z = bs[bs.length - 1];
    v.setSelection({ anchor: { id: bs[0].id, off: 0 }, head: { id: z.id, off: z.text.length }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
    return window.__toc();
  });
  await runMenu('Edit', 'Update field');
  const t9b = await toc();
  ok('Update field over a range holding the table and a SEQ field: no choice; the table made again entire and the SEQ'
    + ' updated, one step', !(await UB.get()) && t9b.toc.includes('TwoXY') && t9b.ps[t9b.ps.length - 1] === 'Figure 1'
    && t9a.ps[t9a.ps.length - 1] === 'Figure 7' && t9b.depth === t9a.depth + 1, { t9a, t9b });

  // Remove, Ctrl+Z
  await caretInToc(1);
  const t10a = await toc();
  await runMenu('Insert', 'Table of Contents...');
  await TB.click('Remove');
  const t10 = await toc();
  ok('Remove takes the table out, one step', !(await TB.get()) && t10.instr === null && t10.toc.length === 0
    && t10.depth === t10a.depth + 1, t10);
  await press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  const t11 = await toc();
  ok('Ctrl+Z puts it back', t11.instr !== null && t11.toc.length === 4, t11);

  // Insert > Caption...
  const CB = B('caption'), LB = B('caplabel'), NB = B('capnum');
  const caretOn = (text) => ev(async (text) => {
    const d = window.__doc(), v = d.dw.view, b = d.dw.doc.sections[0].blocks.find((x) => x.type === 'p'
      && window.__plain(x) === text);
    v.setSelection({ anchor: { id: b.id, off: 1 }, head: { id: b.id, off: 1 }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  }, text);
  const caps = () => ev(() => {
    const d = window.__doc(), bs = d.dw.doc.sections[0].blocks;
    return { ps: bs.map((b) => (b.type === 'p' ? window.__plain(b) : '')), styles: bs.map((b) => b.pStyle || ''),
      depth: d.d.undoDepth, saved: d.dw.app.choices && d.dw.app.choices.captionLabels };
  });
  await caretOn('Said');
  const cm = await menuItem('Insert', 'Caption...');
  ok('Insert > Caption... is there, not shaded', cm && !cm.shaded, cm);
  const c0 = await caps();
  await runMenu('Insert', 'Caption...');
  const cb1 = await CB.get();
  ok('the Caption box: Figure, below, label included', cb1 && cb1.label === 'label:Figure'
    && cb1.position === 'below' && cb1.exclude === false, cb1);
  await CB.set('text', 'A cat');
  await CB.click('OK');
  const c1 = await caps();
  const k1 = c1.ps.indexOf('Figure 1 A cat');
  ok('OK: "Figure 1 A cat" below Said in the caption style, the later caption renumbered, one step, box gone',
    !(await CB.get()) && k1 > 0 && c1.ps[k1 - 1] === 'Said' && c1.styles[k1] === 'Caption'
    && c1.ps[c1.ps.length - 1] === 'Figure 2' && c1.depth === c0.depth + 1, c1);
  await press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  const c2 = await caps();
  ok('Ctrl+Z: no caption, the old number back', !c2.ps.includes('Figure 1 A cat')
    && c2.ps[c2.ps.length - 1] === 'Figure 1' && c2.depth === c0.depth, c2);

  // New Label...: a bad one refused, a good one kept and chosen
  await caretOn('Said');
  await runMenu('Insert', 'Caption...');
  await CB.click('newLabel');
  await LB.set('name', 'a"b');
  const lbp = await beeps();
  await LB.click('OK');
  const lb1 = await LB.get();
  ok('a label with a quote: a beep, the reason, the box kept', lb1 && /quote/.test(lb1.msg)
    && (await beeps()) === lbp + 1, lb1);
  await LB.set('name', 'Plate');
  await LB.click('OK');
  const cb2 = await CB.get(), c3 = await caps();
  ok('New Label... OK: Plate chosen and kept in the choices', !(await LB.get()) && cb2
    && cb2.label === 'label:Plate' && Array.isArray(c3.saved) && c3.saved.includes('Plate'), { cb2, c3 });
  await CB.set('position', 'above');
  await CB.set('text', ': map');
  await CB.click('OK');
  const c4 = await caps();
  const k4 = c4.ps.indexOf('Plate 1: map');
  ok('OK: "Plate 1: map" above Said, one step', k4 >= 0 && c4.ps[k4 + 1] === 'Said'
    && c4.depth === c3.depth + 1, c4);

  // Numbering...: Cancel drops its change
  await caretOn('Said');
  await runMenu('Insert', 'Caption...');
  await CB.click('numbering');
  const nb1 = await NB.get();
  ok('Numbering...: 1, 2, 3, no chapter', nb1 && nb1.format === 'ARABIC'
    && nb1.chapter === false, nb1);
  await NB.set('format', 'ROMAN');
  await NB.click('OK');
  await CB.click('OK');
  const c5 = await caps();
  ok('Numbering ROMAN then OK: "Figure I" below Said', c5.ps.includes('Figure I')
    && c5.depth === c4.depth + 1, c5);
  await press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');

  // Insert > Cross-reference...
  const XB = B('xref'), FB = B('tof');
  const caretEnd = (text) => ev(async (text) => {
    const d = window.__doc(), v = d.dw.view, b = d.dw.doc.sections[0].blocks.find((x) => x.type === 'p'
      && window.__plain(x) === text);
    v.setSelection({ anchor: { id: b.id, off: b.text.length }, head: { id: b.id, off: b.text.length }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  }, text);
  const refsNow = () => ev(() => {
    const d = window.__doc(), bs = d.dw.doc.sections[0].blocks, out = [];
    for (const b of bs) {
      for (const x of Object.values(b.inlines || {})) {
        if (x.node && /instrText$/.test(x.node.name) && /^\s*(REF|PAGEREF|NOTEREF)\b/.test(x.node.children.join('')))
          out.push(x.node.children.join('').trim());
      }
    }
    return { refs: out, ps: bs.map((b) => (b.type === 'p' ? window.__plain(b) : '')), depth: d.d.undoDepth };
  });
  await caretEnd('Body text.');
  const xm = await menuItem('Insert', 'Cross-reference...');
  ok('Insert > Cross-reference... is there, not shaded', xm && !xm.shaded, xm);
  const x0 = await refsNow();
  await runMenu('Insert', 'Cross-reference...');
  const xb1 = await XB.get();
  ok('the Cross-reference box: Heading, Heading text, a heading chosen, as a hyperlink', xb1 && xb1.type === 'heading'
    && xb1.what === 'text' && /^p:/.test(xb1.target) && xb1.hyperlink === true && xb1.above === false, xb1);
  await XB.click('Insert');
  const x1 = await refsNow();
  ok('Insert: REF _Ref... \\h after "Body text." showing the heading, one step, box gone', !(await XB.get())
    && x1.refs.length === x0.refs.length + 1 && x1.refs.some((t) => /^REF _Ref\d{9} \\h$/.test(t))
    && x1.ps.includes('Body text.One') && x1.depth === x0.depth + 1, x1);
  await press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  const x2 = await refsNow();
  ok('Ctrl+Z: the reference gone', x2.refs.length === x0.refs.length && x2.ps.includes('Body text.')
    && x2.depth === x0.depth, x2);
  // the target deleted while the box is open
  await caretEnd('Body text.');
  await runMenu('Insert', 'Cross-reference...');
  const xt = await ev(async () => {
    const d = window.__doc(), v = d.dw.view, bs = d.dw.doc.sections[0].blocks;
    const k = bs.findIndex((x) => window.__plain(x) === 'Three' && /^Heading/.test(x.pStyle || ''));
    window.__box('xref').set('target', 'p:' + bs[k].id);
    v.d.apply({ op: 'removeBlock', at: [0, k] });
    await window.__frames(2);
    return d.d.undoDepth;
  });
  const bpx = await beeps();
  await XB.click('Insert');
  const xb3 = await XB.get(), x4 = await refsNow();
  ok('the target deleted while the box was open: Insert beeps, says the item is no longer there, nothing written',
    xb3 && /no longer there/.test(xb3.msg + ' ' + xb3.msg2) && (await beeps()) === bpx + 1 && x4.depth === xt, { xb3, x4 });
  await XB.click('Cancel');
  await press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  ok('Ctrl+Z: the heading back', (await refsNow()).ps.includes('Three'));
  // a caption, label and number only
  await caretEnd('Body text.');
  await runMenu('Insert', 'Cross-reference...');
  await XB.set('type', 'seq:Figure');
  await runMenu('Insert', 'Cross-reference...');
  const xb2 = await XB.get();
  ok('Reference type Figure: Entire caption first, a caption chosen', xb2 && xb2.type === 'seq:Figure'
    && xb2.what === 'caption' && /^p:/.test(xb2.target), xb2);
  const abv = await ev(() => window.__box('xref').win.iconByName('above')?.shaded);
  ok('Include above/below is shaded for Entire caption', abv === true, abv);
  await XB.set('what', 'labelNumber');
  await XB.click('Insert');
  const x3 = await refsNow();
  ok('Only label and number: "Figure 1" after "Body text.", one step', x3.ps.includes('Body text.Figure 1')
    && x3.depth === x2.depth + 1, x3);
  await press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  // inside a field: shaded
  await ev(async () => {
    const d = window.__doc(), v = d.dw.view, bs = d.dw.doc.sections[0].blocks;
    const b = bs.find((x) => Object.values(x.inlines || {}).some((y) => y.node && /instrText$/.test(y.node.name)
      && /SEQ/.test(y.node.children.join(''))) && /^Figure/.test(window.__plain(x)));
    const k = Number(Object.keys(b.inlines).find((j) => b.inlines[j].node && /instrText$/.test(b.inlines[j].node.name)));
    v.setSelection({ anchor: { id: b.id, off: k }, head: { id: b.id, off: k }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  });
  const xm2 = await menuItem('Insert', 'Cross-reference...');
  ok('in a field\'s code Cross-reference... is shaded', xm2 && xm2.shaded, xm2);

  // Insert > Table of Figures...
  await ev(async () => {
    const d = window.__doc(), v = d.dw.view, b = d.dw.doc.sections[0].blocks.find((x) => x.type === 'p'
      && window.__plain(x) === 'Body text.');
    v.setSelection({ anchor: { id: b.id, off: 0 }, head: { id: b.id, off: 0 }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  });
  const fm = await menuItem('Insert', 'Table of Figures...');
  ok('Insert > Table of Figures... is there, not shaded', fm && !fm.shaded, fm);
  const f0 = await refsNow();
  await runMenu('Insert', 'Table of Figures...');
  const fb1 = await FB.get();
  ok('the Table of Figures box: Figure, label and number, page numbers, hyperlinks; Remove shaded', fb1
    && fb1.label === 'label:Figure' && fb1.includeLabel === true && fb1.pageNumbers === true
    && fb1.hyperlinks === true && fb1.insertText === 'Insert' && fb1.removeShaded === true, fb1);
  await FB.click('Insert');
  const f1 = await ev(() => {
    const d = window.__doc(), bs = d.dw.doc.sections[0].blocks, out = [];
    for (const b of bs) for (const x of Object.values(b.inlines || {})) {
      if (x.node && /instrText$/.test(x.node.name)) out.push(x.node.children.join('').trim());
    }
    return { instrs: out, depth: d.d.undoDepth,
      tof: bs.filter((b) => /figures/i.test(d.dw.doc.styles.styles.get(b.pStyle)?.name || '')).map((b) => window.__plain(b)) };
  });
  ok('Insert: TOC \\h \\z \\c "Figure" with the caption\'s entry, one step, box gone', !(await FB.get())
    && f1.instrs.includes('TOC \\h \\z \\c "Figure"') && f1.tof.length === 1 && /^Figure 1/.test(f1.tof[0])
    && f1.depth === f0.depth + 1, f1);
  await ev(async () => {
    const d = window.__doc(), v = d.dw.view, b = d.dw.doc.sections[0].blocks.find((x) =>
      /figures/i.test(d.dw.doc.styles.styles.get(x.pStyle)?.name || ''));
    v.setSelection({ anchor: { id: b.id, off: 1 }, head: { id: b.id, off: 1 }, affinity: 'down' });
    v.focus();
    await window.__frames(2);
  });
  await runMenu('Insert', 'Table of Contents...');
  const fb2 = await FB.get();
  ok('Table of Contents... in a table of figures opens the Table of Figures box: Update, Remove live', fb2
    && fb2.insertText === 'Update' && fb2.removeShaded === false && !(await TB.get()), fb2);
  await FB.click('Remove');
  const f2 = await ev(() => window.__doc().d.undoDepth);
  ok('Remove: the table of figures gone, one step', !(await FB.get()) && f2 === f1.depth + 1, f2);

  // Edit > Update all fields: one message (Print layout; Outline keeps page numbers)
  await caretAt(0);
  const ua0 = await toc(), m0 = await ev(() => window.__msgs.length);
  await runMenu('Edit', 'Update all fields');
  const ua1 = await toc(), m1 = await ev(() => window.__msgs.slice());
  ok('Update all fields: at most one undo step and ONE message with the count', ua1.depth <= ua0.depth + 1
    && m1.length === m0 + 1 && /field(s)? updated\./.test(m1[m1.length - 1]), { ua0: ua0.depth, ua1: ua1.depth, m1 });
  await runMenu('Edit', 'Update all fields');
  const ua2 = await toc(), m2 = await ev(() => window.__msgs.slice());
  ok('Update all fields again: no undo step, one more message', ua2.depth === ua1.depth && m2.length === m1.length + 1,
    { ua2: ua2.depth, m2 });
  await runMenu('View', 'Outline');
  await runMenu('Edit', 'Update all fields');
  const m3 = await ev(() => window.__msgs.slice());
  ok('in Outline: the message says page numbers need Print layout', m3.length === m2.length + 1
    && /Page numbers need Print layout/.test(m3[m3.length - 1]), m3);
  await runMenu('View', 'Print layout');
  await ev(() => { window.__msgs.length = 0; });

  // the header and footer mode
  await caretAt(0);
  await runMenu('Insert', 'Table of Contents...');
  await runMenu('View', 'Header and footer');
  const hm = await ev(() => !!window.__doc().dw.view.hdr);
  const mi3 = await menuItem('Insert', 'Table of Contents...');
  ok('in the header and footer mode the menu item is shaded', hm && mi3 && mi3.shaded, { hm, mi3 });
  const mi4 = await menuItem('Insert', 'Caption...');
  ok('in the header and footer mode Caption... is shaded', mi4 && mi4.shaded, mi4);
  const mi6 = await menuItem('Edit', 'Update all fields');
  ok('in the header and footer mode Update all fields is shaded', mi6 && mi6.shaded, mi6);
  const mi5 = await menuItem('Insert', 'Cross-reference...');
  ok('in the header and footer mode Cross-reference... is live (an ordinary field)', mi5 && !mi5.shaded, mi5);
  const t12a = await toc(), bp1 = await beeps();
  await TB.click('Insert');
  const b5 = await TB.get(), t12 = await toc();
  ok('the box\'s Insert in the mode: a beep, the reason, the box kept, nothing written', b5
    && /header or footer/.test(b5.msg + ' ' + b5.msg2) && (await beeps()) === bp1 + 1 && t12.depth === t12a.depth,
  { b5, t12 });
  await TB.click('Cancel');
  await press('Escape');

  // closing the window deletes the boxes
  await caretInToc(1);
  await runMenu('Insert', 'Table of Contents...');
  await TB.click('options');
  await caretOn('Said');
  await runMenu('Insert', 'Caption...');
  await CB.click('numbering');
  await CB.click('newLabel');
  await runMenu('Insert', 'Cross-reference...');
  await caretAt(0);
  await runMenu('Insert', 'Table of Figures...');
  const gone = await ev(async () => {
    const d = window.__doc(), dw = d.dw, wins = ['toc', 'tocopts', 'caption', 'capnum', 'caplabel', 'xref', 'tof']
      .map((k) => dw.boxes.get(k));
    dw.close();
    await window.__frames(3);
    return { had: wins.every(Boolean), boxes: dw.boxes.size, open: wins.map((w) => !!w && w.isOpen) };
  });
  ok('closing the window deletes its boxes', gone.had && gone.boxes === 0 && gone.open.every((x) => !x), gone);

  const msgs = await ev(() => window.__msgs);
  ok('nothing reported', !msgs.length, msgs);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
