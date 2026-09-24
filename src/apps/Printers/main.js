// !Printers - the RISC OS 3.71 Printer Manager (Printers 1.54), re-implemented from
// Sources/Printing/Printers/Manager using its real Templates, Messages and sprites.
//
//   * icon bar: "Printers" icon while no printer is active, otherwise one icon per active printer
//     (class sprite dp/lj/ps; the current printer is the highlighted one; text = name or connection).
//     Select: make current (Shift: Configuration), Adjust: Queue control (Shift: Connections).
//     Drop files on a printer icon to print them; drop printer definition files (&FC6) to install.
//   * Printer control window (installed printers: Name / Type / Connection / Status) + its menu,
//     Configuration windows (dp / lj / ps templates), Connections, Queue, Paper sizes, Info.
//   * Output: the document is rendered to HTML sized to the chosen paper and printed through the
//     browser (new window + window.print(), i.e. print or "Save as PDF"). Connection "File" writes a
//     text/HTML file to the virtual disc instead.
//   * os.printers API for other applications (docs/apps/Printers.md).

import { wimp } from '../../core/wimp.js';
import { vfs } from '../../core/vfs.js';
import { Menu } from '../../core/menu.js';
import { loadTemplates } from '../../core/templates.js';
import { loadMessages } from '../../core/messages.js';
import { os } from '../../core/os.js';
import { unsquash } from './unsquash.js';
import { openOutput, renderFile, pageCss, textToHtml } from './print.js';

const STORE = 'riscos371.printers';
const DEF_DIR = 'ADFS::HardDisc4.$.Printing.Printers';

// Generic paper sizes (UK.PaperRO), millipoints
const GENERIC_PAPERS = [
  ['A2 paper size', 1190700, 1683990], ['A3 paper size', 841995, 1190700], ['A4 paper size', 595000, 842000],
  ['Letter paper size', 612000, 792000], ['Legal paper size', 612000, 1008000], ['Fanfold paper size', 576000, 792000],
].map(([pn, pw, ph]) => ({ pn, pw, ph, pt: ph, pb: 0, pl: 0, pr: pw, tt: 0, tb: 0, tl: 0, tr: 0, th: 0, ro: true }));

// Configuration window icon numbers per printer class
const CFG = {
  ps: { name: 13, type: 6, paper: 27, paperMenu: 26, ok: 25, cancel: 33,
    opts: { title: 8, lineNumbers: 11, colour: 7, verbose: 31, accents: 32 },
    pops: [[3, 4, 'feed', ['Auto feed', 'Manual feed']], [16, 20, 'columns', ['1', '2']], [18, 19, 'orientation', ['Portrait', 'Landscape']], [23, 24, 'codes', ['Standard', 'None']]],
    writ: { textScale: 30 } },
  dp: { name: 30, type: 6, paper: 27, paperMenu: 26, ok: 25, cancel: 31,
    opts: { title: 8, lineNumbers: 11, linefeeds: 12 },
    pops: [[3, 20, 'resolution', ['60 by 72 dpi', '120 by 72 dpi', '180 by 180 dpi', '360 by 360 dpi']], [17, 18, 'feed', ['Auto', 'Manual', 'Tractor']],
      [15, 4, 'quality', ['256 colours, small halftone', '256 colours, large halftone', '16 greys, small halftone', 'Monochrome']], [14, 19, 'textQuality', ['No highlights', 'Draft', 'NLQ']], [23, 24, 'codes', ['Standard', 'None']]] },
  lj: { name: 27, type: 6, paper: 25, paperMenu: 26, ok: 24, cancel: 30,
    opts: { title: 8, lineNumbers: 11 },
    pops: [[3, 20, 'resolution', ['75 by 75 dpi', '150 by 150 dpi', '300 by 300 dpi', '600 by 600 dpi']], [17, 18, 'feed', ['Auto', 'Manual']],
      [15, 4, 'quality', ['256 colours, small halftone', '256 colours, large halftone', '16 greys, small halftone', 'Monochrome']], [13, 14, 'orientation', ['Portrait', 'Landscape']], [22, 23, 'codes', ['Standard', 'None']]] },
};


export default async function start(task, ctx) {
  const [tpl, tplDP, tplLJ, tplPS, M] = await Promise.all([
    loadTemplates('assets/templates/Printers.json'),
    loadTemplates('assets/templates/Printers-dp.json'),
    loadTemplates('assets/templates/Printers-lj.json'),
    loadTemplates('assets/templates/Printers-ps.json'),
    loadMessages('Printers'),
  ]);
  const cfgTpl = { dp: tplDP, lj: tplLJ, ps: tplPS };
  const msg = (t, ...a) => M.lookup(t, ...a);
  const menuFrom = (tok) => { const [title, ...items] = msg(tok).replace(/^#/, '').split(','); return { title, items }; };

  // ------------------------------------------------------------------ state
  let printers = [];            // installed printers
  let current = null;           // id of the current printer
  let userPapers = [];
  let nextId = 1;
  const queue = [];             // {id, printer, name, path, size, time, status, progress}
  const renderers = new Map();
  const papers = () => [...GENERIC_PAPERS, ...userPapers];
  const paperByName = (n) => papers().find((p) => p.pn === n) ?? GENERIC_PAPERS[2];
  const shortPaper = (pn) => pn.replace(/ paper size$/i, '');

  function newPrinter(def) {
    return {
      id: nextId++, name: def.name ?? '', type: def.type, cls: def.cls, short: def.short ?? def.type, def: def.def ?? null,
      cnct: { type: 1, file: 'ADFS::HardDisc4.$.PrintOut', append: false, background: true, baud: '9600', data: '8 bits', parity: 'None', stop: '1 bit', xon: false, server: '', nfs: ['', '', '', ''] },
      active: true, paper: def.paper ?? 'A4 paper size',
      opts: { title: false, lineNumbers: false, colour: def.cls === 'ps', verbose: false, accents: true, linefeeds: false, textScale: 100, columns: '1', orientation: 'Portrait', feed: def.cls === 'dp' ? 'Auto' : def.cls === 'ps' ? 'Auto feed' : 'Auto', codes: 'Standard', resolution: def.cls === 'dp' ? '120 by 72 dpi' : '300 by 300 dpi', quality: '256 colours, small halftone', textQuality: 'No highlights' },
    };
  }

  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE) ?? 'null'); } catch { /* */ }
    if (s?.printers) {
      printers = s.printers.map((p) => ({ ...newPrinter(p), ...p, cnct: { ...newPrinter(p).cnct, ...p.cnct }, opts: { ...newPrinter(p).opts, ...p.opts } }));
      nextId = Math.max(0, ...printers.map((p) => p.id)) + 1;
      current = printers.find((p) => p.id === s.current && p.active)?.id ?? printers.find((p) => p.active)?.id ?? null;
      userPapers = s.papers ?? [];
    } else {
      // first run: a PostScript printer on the parallel port (prints through the browser)
      const p = newPrinter({ type: 'PostScript Level 1', cls: 'ps', short: 'PoScript', def: DEF_DIR + '.PoScript' });
      printers = [p]; current = p.id;
    }
  }
  function saveChoices() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ printers, current, papers: userPapers }));
    } catch (e) { task.reportError(msg('OKB', e.message)); }
  }
  load();

  const byId = (id) => printers.find((p) => p.id === id) ?? null;
  const cur = () => byId(current);
  const cnName = (p) => { const t = msg('IC' + p.cnct.type); return t === 'IC' + p.cnct.type ? msg('ICx', p.cnct.type) : t; };
  const cnLower = (p) => msg('CN' + p.cnct.type);

  // ------------------------------------------------------------------ printer definition files
  async function readDefinition(path) {
    const raw = unsquash(await vfs.readFile(path));
    let t = ''; for (let i = 0; i < raw.length; i++) t += String.fromCharCode(raw[i]);
    const get = (k) => (new RegExp('^\\s*' + k + ':\\s*(.*)$', 'm').exec(t)?.[1] ?? '').trim();
    const cls = get('cl') || 'dp';
    if (!cfgTpl[cls]) throw new Error(msg('OK1', cls));
    const dp = get('default_paper_size');
    return { cls, type: get('pr_nme') || vfs.leaf(path), short: get('sh_nme') || vfs.leaf(path), def: vfs.canonical(path), paper: dp && papers().some((p) => p.pn === dp) ? dp : 'A4 paper size' };
  }
  async function install(path) {
    try {
      const d = await readDefinition(path);
      const p = newPrinter(d);
      printers.push(p);
      if (!cur()) current = p.id;
      refresh();
      return p;
    } catch (e) { task.reportError(e.message); return null; }
  }

  // ------------------------------------------------------------------ icon bar
  let icons = [];
  const statusText = (p) => {
    if (p.paused) return msg('QU1');
    if (queue.some((q) => q.printer === p && q.status === 'printing')) return msg('QU2');
    if (p.suspended) return msg('QU3');
    return p.name || cnName(p);
  };
  function rebuildIconbar() {
    for (const h of icons) wimp.iconbar.remove(h);
    icons = [];
    const act = printers.filter((p) => p.active);
    if (!act.length) {
      icons.push(task.addIconbarIcon({
        sprite: 's!printers', text: msg('NNE'), help: msg('ICON0'), menu: mainMenu,
        onClick: (ev) => { if (ev.button !== 'menu') openControl(); },
        onDataLoad: (ev) => dropped(null, ev),
      }));
      return;
    }
    for (const p of act) {
      const h = task.addIconbarIcon({
        sprite: (p.id === current ? '' : 's_') + p.cls, text: statusText(p), help: msg('ICON1', p.name || p.type), menu: mainMenu,
        onClick: (ev) => iconClick(p, ev),
        onDataLoad: (ev) => dropped(p, ev),
      });
      h._printer = p;
      icons.push(h);
    }
  }
  function updateIconbar() {
    for (const h of icons) {
      const p = h._printer;
      if (!p) continue;
      const spr = (p.id === current ? '' : 's_') + p.cls, txt = statusText(p);
      if (h.sprite !== spr || h.text !== txt) wimp.iconbar.update(h, { sprite: spr, text: txt });
    }
  }
  function iconClick(p, ev) {
    if (ev.button === 'menu') return;
    // Shift is the modifier in RISC OS; with the default mouse mapping Shift+click already means Adjust,
    // so Ctrl is accepted as the modifier too (Ctrl+Select = Configure, Ctrl+Adjust = Connections).
    const mod = ev.ctrl || (ev.shift && (os.input?.config?.rightIsAdjust || ev.button === 'select'));
    if (ev.button === 'adjust') { if (mod) openConnections(p); else openQueue(); return; }
    if (mod) { openConfigure(p); return; }
    current = p.id;
    selected = new Set([p.id]);
    refresh();
  }
  function dropped(p, ev) {
    const files = ev.files ?? [];
    const defs = files.filter((f) => f.filetype === 0xFC6);
    const docs = files.filter((f) => f.filetype !== 0xFC6);
    for (const f of defs) install(f.path).then((np) => { if (np && p === null) current = np.id; refresh(); });
    if (docs.length) {
      if (!p) { task.reportError(msg('OKN')); return true; }
      for (const f of docs) printFile(f.path, f.filetype, p);
    }
    return true;
  }

  // ------------------------------------------------------------------ main menu (ME1)
  let infoWin = null;
  function mainMenu() {
    const { title, items } = menuFrom('ME1');
    return new Menu(title, [
      { text: items[0], submenu: () => infoWin ??= makeInfo(), help: msg('HME1-0') },
      { text: items[1], action: () => openControl(), help: msg('HME1-1') },
      { text: items[2], action: () => openQueue(), shaded: () => !printers.some((p) => p.active), help: () => msg(printers.some((p) => p.active) ? 'HME1-2' : 'HME1-2a') },
      { text: items[3], action: () => openPaper(), help: msg('HME1-3') },
      { text: items[4], action: () => saveChoices(), help: msg('HME1-4') },
      { text: items[5], action: () => quit(), help: msg('HME1-5') },
    ]);
  }
  function makeInfo() {
    const w = wimp.createWindowFromTemplate(tpl, 'info', {}, task);
    w.icons[3].setText(msg('VSN'));
    w.helpText = msg('INFO');
    return w;
  }

  // ------------------------------------------------------------------ Printer control window
  let ctrl = null, selected = new Set(), rowIcons = [];
  const ROW = 24;
  function openControl() {
    if (!ctrl) {
      ctrl = wimp.createWindowFromTemplate(tpl, 'prntctrl', { title: 'Printer control' }, task);
      ctrl.helpText = msg('PRCTRL');
      ['NAME', 'TYPE', 'CN', 'ST'].forEach((t, i) => ctrl.icons[i].setText(msg(t)));
      ctrl.icons[4].setState({ deleted: true });
      ctrl.on('click', (ev) => {
        if (ev.button === 'menu') { wimp.menus.openAt(controlMenu(), ev, { task }); return true; }
        const r = rowAt(ev.y);
        const p = r >= 0 ? printers[r] : null;
        if (ev.button === 'select') { selected = new Set(p ? [p.id] : []); }
        else if (ev.button === 'adjust' && p) { if (selected.has(p.id)) selected.delete(p.id); else selected.add(p.id); }
        drawControl();
        return true;
      });
      ctrl.on('doubleclick', (ev) => {
        const r = rowAt(ev.y);
        if (r >= 0) { selected = new Set([printers[r].id]); drawControl(); openConfigure(printers[r]); }
        return true;
      });
      ctrl.on('dataload', (ev) => {
        for (const f of ev.files) { if (f.filetype === 0xFC6) install(f.path); else task.reportError(msg('OKN')); }
        return true;
      });
      ctrl.on('close', (ev) => { ev.preventDefault(); ctrl.close(); });
    }
    drawControl();
    if (!ctrl.isOpen) {
      const h = Math.min(ctrl.extent.y1 - ctrl.extent.y0, wimp.height - 200);
      ctrl.open({ h, y: Math.min(ctrl.y, wimp.height - wimp.iconbar.height - h - 40), behind: 'top' });
    } else ctrl.bringToFront();
  }
  const rowTop = () => ctrl.icons[4].bbox.y0;
  const rowAt = (y) => { const r = Math.floor((y - rowTop()) / ROW); return r >= 0 && r < printers.length ? r : -1; };
  function drawControl() {
    if (!ctrl) return;
    for (const i of rowIcons) ctrl.deleteIcon(i);
    rowIcons = [];
    const top = rowTop();
    printers.forEach((p, r) => {
      const texts = [p.name, p.type, cnName(p), msg(p.active ? 'ACT' : 'INA')];
      for (let c = 0; c < 4; c++) {
        const h = ctrl.icons[c];
        const ic = ctrl.addIcon({ bbox: { x0: h.bbox.x0, x1: h.bbox.x1, y0: top + r * ROW, y1: top + (r + 1) * ROW }, flags: (h.flags & ~(1 << 21)) | (selected.has(p.id) ? 1 << 21 : 0), text: texts[c], bufLen: 64 });
        rowIcons.push(ctrl.icons.indexOf(ic));
      }
    });
    const want = Math.max(ctrl.extent.y1, top + Math.max(1, printers.length) * ROW + 4);
    if (want !== ctrl.extent.y1) ctrl.setExtent({ x0: ctrl.extent.x0, y0: ctrl.extent.y0, x1: ctrl.extent.x1, y1: want });
    if (ctrl.isOpen && ctrl.h < want - ctrl.extent.y0) ctrl.open({ h: Math.min(want - ctrl.extent.y0, wimp.height - 200) });
  }
  function controlMenu() {
    const { title, items } = menuFrom('MC1');
    const sel = () => printers.filter((p) => selected.has(p.id));
    return new Menu(title, [
      { text: items[0], shaded: () => sel().length !== 1, action: () => openConfigure(sel()[0]), help: msg('HMC1-0') },
      { text: items[1], shaded: () => sel().length !== 1, action: () => openConnections(sel()[0]), help: msg('HMC1-1') },
      { text: items[2], shaded: () => !sel().length, action: () => { for (const p of sel()) p.active = true; if (!cur()) current = sel()[0].id; refresh(); }, help: msg('HMC1-2') },
      { text: items[3], shaded: () => !sel().length, action: () => { for (const p of sel()) p.active = false; if (!cur()?.active) current = printers.find((p) => p.active)?.id ?? null; refresh(); }, help: msg('HMC1-3') },
      { text: items[4].replace(/#$/, ''), dotted: true, shaded: () => !sel().length, action: () => { printers = printers.filter((p) => !selected.has(p.id)); selected.clear(); if (!cur()) current = printers.find((p) => p.active)?.id ?? null; refresh(); }, help: msg('HMC1-4') },
      { text: items[5], action: () => { selected = new Set(printers.map((p) => p.id)); drawControl(); }, help: msg('HMC1-5') },
      { text: items[6], shaded: () => !selected.size, action: () => { selected.clear(); drawControl(); }, help: msg('HMC1-6') },
    ]);
  }

  // ------------------------------------------------------------------ popup menus beside icons
  function popup(win, icon, title, items, current, pick) {
    const p = win.workToScreen(icon.bbox.x1, icon.bbox.y0);
    wimp.menus.open(new Menu(title, items.map((t) => ({ text: t, ticked: () => current() === t, action: () => pick(t) }))), p.x, p.y, { task });
  }

  // ------------------------------------------------------------------ Configuration window
  const cfgWins = new Map();
  function openConfigure(p) {
    if (!p) return;
    let w = cfgWins.get(p.id);
    if (!w) {
      const C = CFG[p.cls];
      w = wimp.createWindowFromTemplate(cfgTpl[p.cls], 'configure', {}, task);
      cfgWins.set(p.id, w);
      const I = w.icons;
      const edit = { ...p.opts, paper: p.paper };
      const show = () => {
        I[C.name].setText(p.name); I[C.type].setText(p.type); I[C.paper].setText(shortPaper(edit.paper));
        for (const [k, i] of Object.entries(C.opts)) I[i]?.setState({ selected: !!edit[k] });
        for (const [disp, , k] of C.pops) I[disp]?.setText(String(edit[k]));
        for (const [k, i] of Object.entries(C.writ ?? {})) I[i]?.setText(String(edit[k]));
      };
      w._show = () => { Object.assign(edit, p.opts, { paper: p.paper }); show(); };
      show();
      w.on('click', (ev) => {
        if (ev.button === 'menu') return;
        const i = ev.iconIndex;
        if (i === C.paperMenu || i === C.paper) { popup(w, I[C.paperMenu], menuFrom('MP1').title, papers().map((x) => x.pn), () => edit.paper, (v) => { edit.paper = v; show(); }); return true; }
        for (const [disp, btn, k, choices] of C.pops) if (i === btn || i === disp) { popup(w, I[btn], I[disp].text, choices, () => String(edit[k]), (v) => { edit[k] = v; show(); }); return true; }
        for (const [k, oi] of Object.entries(C.opts)) if (i === oi) { edit[k] = I[oi].selected; return; }
        if (i === C.ok) {
          p.name = I[C.name].text.trim();
          for (const [k, wi] of Object.entries(C.writ ?? {})) edit[k] = Math.max(10, Math.min(400, parseInt(I[wi].text, 10) || 100));
          const { paper, ...opts } = edit;
          p.paper = paper; Object.assign(p.opts, opts);
          refresh();
          if (ev.button !== 'adjust') w.close();
        }
        if (i === C.cancel) { if (ev.button === 'adjust') w._show(); else w.close(); }
        return true;
      });
      w.on('key', (ev) => { if (ev.code === 13) { w.emit('click', { button: 'select', iconIndex: C.ok, icon: I[C.ok] }); return true; } if (ev.code === 27) { w.close(); return true; } });
    } else w._show();
    w.open({ behind: 'top' });
    const C = CFG[p.cls];
    wimp.setCaret(w, w.icons[C.name], w.icons[C.name].text.length);
  }

  // ------------------------------------------------------------------ Connections window
  let conn = null, connFor = null;
  function openConnections(p) {
    if (!p) return;
    connFor = p;
    if (!conn) {
      conn = wimp.createWindowFromTemplate(tpl, 'connections', {}, task);
      conn.helpText = msg('CNCT');
      const I = conn.icons;
      const radios = [0, 1, 2, 3, 4, 33];
      const typeOf = { 0: 1, 1: 2, 2: 4, 3: 6, 4: 5, 33: 8 };
      conn._fill = () => {
        const q = connFor, c = q.cnct;
        I[31].setText(q.name || q.type);
        for (const r of radios) I[r].setState({ selected: typeOf[r] === c.type });
        I[15].setText(c.baud); I[17].setText(c.data.replace(/ bits?/, '')); I[18].setText(c.parity.toLowerCase()); I[19].setText(c.stop.replace(/ bits?/, ''));
        I[13].setState({ selected: c.xon }); I[35].setState({ selected: c.append }); I[37].setState({ selected: c.background });
        I[25].setText(c.server); [26, 27, 28, 29].forEach((n, j) => I[n].setText(c.nfs[j] ?? ''));
        I[30].setText(c.file);
        shade();
      };
      const shade = () => {
        const on = (r) => I[r].selected;
        for (const n of [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]) I[n].setState({ shaded: !on(1) });
        for (const n of [20, 25]) I[n].setState({ shaded: !on(2) });
        for (const n of [21, 22, 23, 24, 26, 27, 28, 29]) I[n].setState({ shaded: !on(3) });
        for (const n of [30, 32, 34, 35]) I[n].setState({ shaded: !on(4) });
      };
      conn.on('click', (ev) => {
        if (ev.button === 'menu') return;
        const i = ev.iconIndex, c = connFor.cnct;
        if (radios.includes(i)) { for (const r of radios) I[r].setState({ selected: r === i }); shade(); return true; }
        const pm = (btn, disp, tok, list, set) => popup(conn, I[btn], menuFrom(tok).title, list, () => I[disp].text, set);
        if (i === 8) { pm(8, 15, 'ME2', [...msg('ME2a').split(','), ...msg('ME2b').split(',')].filter(Boolean), (v) => I[15].setText(v)); return true; }
        if (i === 11) { pm(11, 17, 'ME3', menuFrom('ME3').items, (v) => I[17].setText(v.replace(/ bits?/, ''))); return true; }
        if (i === 14) { pm(14, 18, 'ME4', menuFrom('ME4').items, (v) => I[18].setText(v.toLowerCase())); return true; }
        if (i === 16) { pm(16, 19, 'ME5', [msg('SB0'), msg('SB1a')], (v) => I[19].setText(v.replace(/ bits?/, ''))); return true; }
        if (i === 5) {
          const r = radios.find((x) => I[x].selected);
          Object.assign(c, {
            type: typeOf[r] ?? 1, baud: I[15].text, data: I[17].text + ' bits', parity: I[18].text, stop: I[19].text + (I[19].text === '1' ? ' bit' : ' bits'),
            xon: I[13].selected, append: I[35].selected, background: I[37].selected, server: I[25].text, nfs: [26, 27, 28, 29].map((n) => I[n].text), file: I[30].text,
          });
          refresh();
          if (ev.button !== 'adjust') conn.close();
          return true;
        }
        if (i === 38) { if (ev.button === 'adjust') conn._fill(); else conn.close(); return true; }
      });
    }
    conn._fill();
    conn.open({ behind: 'top' });
  }

  // ------------------------------------------------------------------ Queue window
  let qwin = null, qIcons = [];
  function openQueue() {
    if (!qwin) {
      qwin = wimp.createWindowFromTemplate(tpl, 'queue', {}, task);
      qwin.helpText = msg('QUEUE');
      for (let i = 0; i < 6; i++) qwin.icons[i].setState({ deleted: true });
      qwin.on('click', (ev) => { if (ev.button === 'menu') { wimp.menus.openAt(queueMenu(), ev, { task }); return true; } });
      qwin.on('dataload', (ev) => { const p = cur(); if (p) for (const f of ev.files) printFile(f.path, f.filetype, p); return true; });
      qwin.on('close', (ev) => { ev.preventDefault(); qwin.close(); });
    }
    drawQueue();
    qwin.open({ behind: 'top' });
  }
  const pad = (n) => String(n).padStart(2, '0');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function drawQueue() {
    if (!qwin) return;
    for (const i of qIcons) qwin.deleteIcon(i);
    qIcons = [];
    const T = qwin.icons;
    let y = 0;
    const add = (src, text, dy) => { const b = src.bbox; const ic = qwin.addIcon({ bbox: { x0: b.x0, x1: b.x1, y0: y, y1: y + dy }, flags: src.flags & ~(1 << 23), text, bufLen: 128 }); qIcons.push(qwin.icons.indexOf(ic)); };
    const H = T[0].bbox.y1 - T[0].bbox.y0;
    for (const p of printers.filter((x) => x.active)) {
      const st = msg(p.paused ? 'QU1' : p.suspended ? 'QU3' : queue.some((q) => q.printer === p && q.status === 'printing') ? 'QU2' : 'QU0');
      add(T[0], (p.id === current ? '' : '') + msg(p.cnct.background ? 'QULB' : 'QUL', '', p.name || p.type, cnLower(p), st), H);
      y += H;
      for (const q of queue.filter((x) => x.printer === p)) {
        const d = q.time;
        const h12 = d.getHours() % 12 || 12;
        add(T[1], `${pad(h12)}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'am' : 'pm'}`, H);
        add(T[2], `${pad(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`, H);
        add(T[3], msg('QF3', q.progress, q.size).replace('%%', '%'), H);
        add(T[4], ' ' + q.name, H);
        y += H;
      }
    }
    const want = Math.max(y + 8, 60);
    qwin.setExtent({ x0: 0, y0: 0, x1: qwin.extent.x1, y1: want });
    if (qwin.isOpen) qwin.open({ h: Math.min(want, 400) });
  }
  function queueMenu() {
    const { title, items } = menuFrom('MQ1');
    const p = cur();
    return new Menu(title, [
      { text: items[0], shaded: () => !p || p.paused || p.suspended, action: () => { p.paused = true; refresh(); }, help: msg('HMQ1-0') },
      { text: items[1], shaded: () => !p || p.paused || p.suspended, action: () => { p.suspended = true; refresh(); }, help: msg('HMQ1-1') },
      { text: items[2], shaded: () => !p || !(p.paused || p.suspended), action: () => { p.paused = p.suspended = false; refresh(); pump(); }, help: msg('HMQ1-2') },
      { text: items[3].replace(/#$/, ''), dotted: true, shaded: () => !p, action: () => { for (let i = queue.length - 1; i >= 0; i--) if (queue[i].printer === p && queue[i].status !== 'printing') queue.splice(i, 1); refresh(); }, help: msg('HMQ1-3') },
      { text: msg('MQ1a'), shaded: true, help: msg('SMQ1-7') },
      { text: items[5], shaded: true, help: msg('SMQ1-7') },
      { text: items[6], shaded: true, help: msg('SMQ1-7') },
    ]);
  }

  // ------------------------------------------------------------------ Paper sizes window
  let pwin = null;
  function openPaper() {
    if (!pwin) {
      pwin = wimp.createWindowFromTemplate(tpl, 'papersize', {}, task);
      pwin.helpText = msg('PAPER');
      const I = pwin.icons;
      let unitsMM = true, cur = paperByName('A4 paper size');
      const MMF = 72000 / 25.4, INF = 72000;
      const f = (mp) => (unitsMM ? (mp / MMF).toFixed(1) : (mp / INF).toFixed(2));
      const g = (s) => Math.round((parseFloat(s) || 0) * (unitsMM ? MMF : INF));
      const fill = () => {
        I[5].setText(cur.pn);
        I[6].setText(f(cur.pw)); I[7].setText(f(cur.ph));
        I[8].setText(f(cur.ph - cur.pt)); I[9].setText(f(cur.pb)); I[10].setText(f(cur.pl)); I[11].setText(f(cur.pw - cur.pr));
        I[12].setText(String(cur.tt)); I[13].setText(String(cur.tb)); I[14].setText(String(cur.tl)); I[15].setText(String(cur.tr)); I[16].setText(String(cur.th));
        I[23].setState({ selected: unitsMM }); I[22].setState({ selected: !unitsMM });
        for (const n of [26, 27, 28, 29, 30, 31]) I[n].setText(msg(unitsMM ? 'mm' : 'in'));
        I[33].setState({ shaded: !!cur.ro });
      };
      pwin._fill = fill;
      pwin.on('click', (ev) => {
        if (ev.button === 'menu') return;
        const i = ev.iconIndex;
        if (i === 47) { popup(pwin, I[47], menuFrom('MP1').title, papers().map((x) => x.pn), () => cur.pn, (v) => { cur = paperByName(v); fill(); }); return true; }
        if (i === 22 || i === 23) { unitsMM = i === 23; fill(); return true; }
        if (i === 42) {   // Save
          const pn = I[5].text.trim();
          if (!pn) return true;
          const np = { pn, pw: g(I[6].text), ph: g(I[7].text), pl: g(I[10].text), pb: g(I[9].text), tt: +I[12].text || 0, tb: +I[13].text || 0, tl: +I[14].text || 0, tr: +I[15].text || 0, th: +I[16].text || 0 };
          np.pt = np.ph - g(I[8].text); np.pr = np.pw - g(I[11].text);
          if (GENERIC_PAPERS.some((x) => x.pn === pn)) { task.reportError(msg('OKA', pn).replace('cannot be found', 'cannot be replaced')); return true; }
          userPapers = userPapers.filter((x) => x.pn !== pn).concat(np);
          cur = np;
          if (ev.button !== 'adjust') pwin.close();
          return true;
        }
        if (i === 33) { if (!cur.ro) { userPapers = userPapers.filter((x) => x !== cur); cur = paperByName('A4 paper size'); fill(); if (ev.button !== 'adjust') pwin.close(); } return true; }
        if (i === 48) { if (ev.button === 'adjust') fill(); else pwin.close(); return true; }
      });
    }
    pwin._fill();
    pwin.open({ behind: 'top' });
  }

  // ------------------------------------------------------------------ "How to print?" query
  let hq = null;
  function howQuery(leaf) {
    return new Promise((resolve) => {
      hq?.delete();
      hq = wimp.createWindowFromTemplate(tpl, 'howquery', {}, task);
      hq.helpText = msg('HWQRY');
      hq.icons[0].setText(`'${leaf}' is not a type of file that the printer driver knows how to print. It can be printed as plain text.`);
      hq.icons[2].setState({ shaded: true });     // "Fancy" (1st Word Plus) not supported
      hq.on('click', (ev) => {
        if (ev.button === 'menu') return;
        const i = ev.iconIndex;
        if (i === 4 || i === 3) { const w = hq; hq = null; w.delete(); resolve(i === 4); }
        return true;
      });
      hq.on('close', (ev) => { ev.preventDefault(); const w = hq; hq = null; w.delete(); resolve(false); });
      hq.open({ x: Math.round(wimp.width / 2 - hq.w / 2), y: Math.round(wimp.height / 3), behind: 'top' });
    });
  }

  // ------------------------------------------------------------------ printing
  const optsOf = (p) => ({ title: p.opts.title, lineNumbers: p.opts.lineNumbers, textScale: p.opts.textScale, columns: +p.opts.columns || 1 });
  const landscapeOf = (p) => p.opts.orientation === 'Landscape';

  /** Queue a job: {printer, name, size, produce: async () => {title, html, text}} */
  function enqueue(p, name, size, produce, out) {
    const job = { id: Math.random(), printer: p, name, size: size ?? 0, time: new Date(), status: 'waiting', progress: 0, produce, out };
    queue.push(job);
    refresh();
    pump();
    return new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
  }
  async function pump() {
    for (const job of queue) {
      if (job.status !== 'waiting') continue;
      const p = job.printer;
      if (p.paused || p.suspended || queue.some((q) => q.printer === p && q.status === 'printing')) continue;
      job.status = 'printing';
      refresh();
      try {
        const doc = await job.produce();
        job.progress = 50; refresh();
        if (!doc) { job.out?.close(); throw Object.assign(new Error('cancelled'), { cancelled: true }); }
        const css = pageCss(paperByName(p.paper), landscapeOf(p));
        if (p.cnct.type === 5) {        // To file
          const path = p.cnct.file || 'ADFS::HardDisc4.$.PrintOut';
          const isText = doc.text != null;
          const data = isText ? doc.text : `<html><head><title>${doc.title}</title><style>${css}</style></head><body>${doc.html}</body></html>`;
          let prev = '';
          if (p.cnct.append && vfs.exists(path)) prev = await vfs.readText(path);
          vfs.writeFile(path, prev + data, { filetype: isText ? 0xFFF : 0xFAF });
          job.out?.close();
        } else {
          (job.out ?? openOutput(doc.title)).write({ title: doc.title, html: doc.html, css });
        }
        job.progress = 100;
        await new Promise((r) => setTimeout(r, 600));
        job.resolve?.(true);
      } catch (e) {
        if (!e.cancelled) task.reportError(msg('OKPa', e.message ?? String(e)));
        job.resolve?.(false);
      }
      queue.splice(queue.indexOf(job), 1);
      refresh();
      pump();
      return;
    }
  }

  function printFile(path, filetype, p = cur()) {
    if (!p) { task.reportError(msg('OKN')); return Promise.resolve(false); }
    const st = vfs.stat(path);
    if (!st || st.type === 'dir') { task.reportError(msg(st?.isApp ? 'QT2' : 'QT1') + ' ' + vfs.leaf(path) + ' cannot be printed'); return Promise.resolve(false); }
    const out = p.cnct.type === 5 ? null : openOutput(vfs.leaf(path));   // open the window inside the user gesture
    return enqueue(p, vfs.leaf(path), st.size, async () => {
      let doc = await renderFile(path, filetype ?? st.filetype, optsOf(p), renderers);
      if (!doc) {
        if (!(await howQuery(vfs.leaf(path)))) return null;
        doc = await renderFile(path, st.filetype, optsOf(p), renderers, { asText: true });
      }
      if (p.cnct.type === 5 && (filetype === 0xFFF)) doc.text = await vfs.readText(path);
      return doc;
    }, out);
  }

  // ------------------------------------------------------------------ public API
  const api = {
    get current() {
      const p = cur();
      if (!p) return null;
      const pp = paperByName(p.paper);
      return { name: p.name || p.type, type: p.type, class: p.cls, connection: cnName(p), paper: { name: pp.pn, width: pp.pw / 72000 * 25.4, height: pp.ph / 72000 * 25.4 }, landscape: landscapeOf(p) };
    },
    get printers() { return printers.map((p) => ({ name: p.name, type: p.type, class: p.cls, active: p.active, current: p.id === current })); },
    /** Print a document: {title, text | html (string or Promise) | canvas | images:[canvas|url]}. Resolves true when sent. */
    print(doc = {}) {
      const p = cur();
      if (!p) { task.reportError(msg('OKN')); return Promise.resolve(false); }
      const title = doc.title ?? 'Printout';
      const out = p.cnct.type === 5 ? null : openOutput(title);
      return enqueue(p, title, doc.size ?? (doc.text?.length ?? 0), async () => {
        if (doc.text != null) return { title, html: textToHtml(doc.text, title, optsOf(p)), text: doc.text };
        let html = (await doc.html) ?? '';   // html may be a Promise (rendered after the window opened)
        if (doc.canvas) html += `<img class="pic" style="width:100%" src="${doc.canvas.toDataURL()}">`;
        for (const im of doc.images ?? []) html += `<img class="pic" src="${typeof im === 'string' ? im : im.toDataURL()}">`;
        return { title, html: (doc.css ? `<style>${doc.css}</style>` : '') + html };
      }, out);
    },
    printFile: (path, type) => printFile(path, type),
    /** Register a renderer for a file type: fn(bytes, path) → {canvas}|{html}|htmlString. */
    registerRenderer(type, fn) { renderers.set(type, fn); },
    open: () => openControl(),
  };
  for (const [t, fn] of os.printerRenderers ?? []) renderers.set(t, fn);
  os.printers = api;

  // ------------------------------------------------------------------ refresh, messages, quit
  function refresh() {
    if (current != null && !cur()?.active) current = printers.find((p) => p.active)?.id ?? null;
    const want = printers.filter((p) => p.active).map((p) => p.id).join(',') || 'main';
    if (want !== rebuildIconbar._last) { rebuildIconbar._last = want; rebuildIconbar(); } else updateIconbar();
    drawControl();
    drawQueue();
  }
  rebuildIconbar._last = null;

  function quit() {
    if (queue.length) {
      const w = wimp.createWindowFromTemplate(tpl, 'shutdown', {}, task);
      w.helpText = msg('SHTDWN');
      w.on('click', (ev) => { if (ev.iconIndex === 3) { queue.length = 0; w.delete(); task.quit(); } else if (ev.iconIndex === 2) w.delete(); return true; });
      w.open({ x: Math.round(wimp.width / 2 - w.w / 2), y: Math.round(wimp.height / 3), behind: 'top' });
      return;
    }
    task.quit();
  }
  task.on('quit', () => { if (os.printers === api) os.printers = null; });
  task.onMessage('PreQuit', (m) => { if (queue.length) { m.object?.(); quit(); } });
  task.onMessage('Quit', () => task.quit());
  task.onMessage('DataOpen', (m) => { if (m.filetype === 0xFC6) { install(m.path); return true; } });
  task.on('run', ({ file }) => { if (file && vfs.stat(file)?.filetype === 0xFC6) install(file); });

  refresh();
  if (ctx.file && vfs.stat(ctx.file)?.filetype === 0xFC6) install(ctx.file);
}
