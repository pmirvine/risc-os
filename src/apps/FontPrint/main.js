// !FontPrint 1.26 - native port of Sources/Printing/FontPrint (c/Main, c/Fonts, c/Icons, c/Menu, c/Panes).
//
// FontPrint edits the list of fonts known by the current PostScript printer: each entry either maps a
// RISC OS font to a PostScript font ("Trinity.Medium  Map to  Times-Roman", with an encoding) or asks
// for the font to be downloaded. The list lives in the printer's font file, whose name !Printers
// supplies (PSPrinterQuery / PSPrinterAck); Save writes it back and tells !Printers (PSPrinterModified),
// Defaults asks !Printers to rewrite it from the printer definition (PSPrinterDefaults).
//
// Here !Printers is the JS app (os.printers). Its side of the protocol is emulated in `queryPrinter()`:
//   * no !Printers running    -> the recorded delivery bounces: "No PostScript printer selected", greyed
//   * current printer not PS  -> PSPrinterNotPS: the same
//   * PS printer              -> name, type and font file <Choices$Write>.Printers.ps.Printers.<n>; the file is
//                                created from the printer definition's font_alias list (as !Printers'
//                                PROCps_create_default_font_file) when it doesn't exist yet.
// !Printers broadcasts SetPrinter when the user picks another printer; the JS !Printers has no such message,
// so FontPrint watches os.printers and re-queries when the current printer changes.

import { wimp } from '../../core/wimp.js';
import { vfs } from '../../core/vfs.js';
import { sysvars } from '../../core/sysvars.js';
import { Menu } from '../../core/menu.js';
import { loadTemplates } from '../../core/templates.js';
import { loadMessages } from '../../core/messages.js';
import { fonts as deskFonts } from '../../core/fonts.js';
import { os } from '../../core/os.js';
import { unsquash } from '../Printers/unsquash.js';

const DEF_ROOT = 'ADFS::HardDisc4.$.Printing.Printers';
const DEFAULT_ENCODING = 'Adobe.Standard';
// Printers:PS.Adobe (the ROM !Printers' encoding directory, DataFiles/ps/Adobe), in directory order
const ENCODINGS = ['Adobe.Special', 'Adobe.Standard'];
const ROW = 19;                 // icon_distance: ICON_HEIGHT 36 + ICON_SPACING 2 OS units, in pixels

// ------------------------------------------------------------------------ printer definitions
let defIndex = null;            // pr_nme -> {path, aliases}
async function readDef(path) {
  const raw = unsquash(await vfs.readFile(path));
  let t = ''; for (let i = 0; i < raw.length; i++) t += String.fromCharCode(raw[i]);
  const cls = /^\s*cl:\s*(\S+)/m.exec(t)?.[1];
  const name = /^\s*pr_nme:\s*(.*)$/m.exec(t)?.[1]?.trim();
  if (!name) return null;
  const aliases = [];
  const m = /font_alias:[\s\S]*?fonts:\s*\d+\s*\n([\s\S]*?)(?=\n\S|$)/.exec(t);
  if (m) for (const line of m[1].split('\n')) {
    const f = line.split(',').map((s) => s.trim()).filter(Boolean);
    if (f.length >= 2) aliases.push(f);
  }
  return { name, cls, path, aliases };
}
async function findDefinition(type) {
  if (!defIndex) {
    defIndex = new Map();
    const walk = async (dir, depth) => {
      let list = [];
      try { list = vfs.list(dir); } catch { return; }
      for (const e of list) {
        const p = `${dir}.${e.name}`;
        if (e.type === 'dir') { if (depth < 2) await walk(p, depth + 1); continue; }
        if (e.filetype !== 0xFC6) continue;
        try { const d = await readDef(p); if (d?.cls === 'ps' && !defIndex.has(d.name)) defIndex.set(d.name, d); } catch { /* */ }
      }
    };
    await walk(DEF_ROOT, 0);
  }
  return defIndex.get(type) ?? null;
}

export default async function start(task, ctx) {
  const [tpl, M] = await Promise.all([loadTemplates('assets/templates/FontPrint.json'), loadMessages('FontPrint')]);
  const msg = (t, ...a) => M.lookup(t, ...a);
  sysvars.set('FontPrint$Dir', ctx.dir ?? ctx.app.appDir);

  // already_running(): PSIsFontPrintRunning is acknowledged by another FontPrint
  if (os.apps.tasksOf('FontPrint').some((t) => t !== task)) {
    wimp.reportError(msg('running').replace(/^abcd/, ''), { appName: msg('taskname') });
    task.quit();
    return;
  }

  // ---------------------------------------------------------------- state (c/Fonts)
  let list = [];                // {local, foreign|null, encoding, selected}
  let enabled = false;          // window_enabled
  let tempsel = false;
  let printerName = '', printerType = '', printerFile = '';
  let lastKey = null;
  const numSelected = () => list.filter((f) => f.selected).length;

  // ---------------------------------------------------------------- windows (c/Panes)
  const main = wimp.createWindowFromTemplate(tpl, 'Download', {}, task);
  const pane = wimp.createWindowFromTemplate(tpl, 'List', {}, task);
  // find_offsets(): the pane's place in the main window, from the two templates' positions
  const offx = pane.x - main.x, offy = pane.y - main.y, sizex = pane.w, sizey = pane.h;
  main.attachPane(pane, { dx: offx, dy: offy, w: sizex, h: sizey });
  main.helpText = msg('winhelp');
  pane.helpText = msg('panehelp');
  const I = main.icons;
  const col1 = Math.round(sizex * (+msg('percent1') || 42) / 100), col2 = Math.round(sizex * (+msg('percent2') || 58) / 100);

  pane.useCanvas((g, r) => {
    g.fillStyle = '#fff'; g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    g.font = deskFonts.css; g.textBaseline = 'middle';
    list.forEach((f, i) => {
      const y = i * ROW;
      if (y > r.y1 || y + ROW < r.y0) return;
      if (f.selected) { g.fillStyle = '#000'; g.fillRect(0, y, sizex, ROW); }
      g.fillStyle = f.selected ? '#fff' : '#000';
      const cells = f.foreign == null ? [f.local, msg('sDownLoad'), ''] : [f.local, msg('sMapTo'), f.foreign];
      const xs = [0, col1, col2], ws = [col1, col2 - col1, sizex - col2];
      cells.forEach((c, k) => {
        g.save(); g.beginPath(); g.rect(xs[k], y, ws[k], ROW); g.clip();
        g.fillText(c, xs[k] + 6, y + ROW / 2 + 1); g.restore();
      });
    });
  });
  function fixExtent(scrollToBottom = false) {
    const h = Math.max(sizey, list.length * ROW);
    pane.setExtent({ w: sizex, h });
    if (scrollToBottom && pane.isOpen) pane.open({ scrollY: Math.max(0, h - sizey), behind: 'keep' });
    pane.invalidate();
  }
  function ensureVisible(i) {
    const y0 = i * ROW, y1 = y0 + ROW;
    if (!pane.isOpen) return;
    if (y0 < pane.scrollY) pane.open({ scrollY: y0, behind: 'keep' });
    else if (y1 > pane.scrollY + pane.h) pane.open({ scrollY: y1 - pane.h, behind: 'keep' });
  }
  const whichRow = (y) => { const i = Math.floor(y / ROW); return i >= 0 && i < list.length ? i : -1; };
  const deselectAll = () => { for (const f of list) f.selected = false; };

  function fixEnabled() {
    I[2].setState({ shaded: !enabled });
    I[3].setState({ shaded: !enabled });
  }
  function showPrinter() {
    main.setTitle(printerName ? msg('winname').replace('%s', printerName) : msg('nwinname'));
    I[1].setText(printerType);
    fixEnabled();
    fixExtent();
  }

  // ---------------------------------------------------------------- the printer file (read_printer_file)
  async function readPrinterFile() {
    enabled = false;
    list = [];
    if (printerFile) {
      try {
        const text = await vfs.readText(printerFile);
        for (const line of text.split(/\r?\n/)) {
          const [local, foreign, encoding] = line.split(/[ \n]+/).filter(Boolean);
          if (!local) continue;
          list.push({ local, foreign: foreign ?? null, encoding: encoding ?? '', selected: false });
        }
        enabled = true;
      } catch { /* fopen failed: window stays greyed */ }
    }
    tempsel = false;
    showPrinter();
  }
  function fontFileFor() {
    const n = (os.printers?.printers ?? []).findIndex((p) => p.current) + 1 || 1;
    return `${sysvars.get('Choices$Write') ?? 'ADFS::HardDisc4.$.!Boot.Choices'}.Printers.ps.Printers.${n}`;
  }
  // PROCps_create_default_font_file (in !Printers)
  async function writeDefaults(file, type) {
    const def = await findDefinition(type);
    const lines = (def?.aliases ?? []).map((a) => `${a[0]} ${a[1]} ${a[2] ?? DEFAULT_ENCODING}`);
    vfs.mkdir(vfs.parent(file), { parents: true });
    vfs.writeFile(file, lines.join('\n') + (lines.length ? '\n' : ''), { filetype: 0xFFF });
  }
  // query_printer(): PSPrinterQuery -> PSPrinterAck / PSPrinterNotPS / bounce
  async function queryPrinter() {
    const cur = os.printers?.current ?? null;
    if (!cur || cur.class !== 'ps') {
      printerName = ''; printerType = ''; printerFile = '';
    } else {
      printerName = cur.name ?? ''; printerType = cur.type ?? ''; printerFile = fontFileFor();
      if (!vfs.exists(printerFile)) { try { await writeDefaults(printerFile, printerType); } catch { /* */ } }
    }
    await readPrinterFile();
  }
  const printerKey = () => { const c = os.printers?.current; return c ? `${c.class}|${c.name}|${c.type}|${fontFileFor()}` : ''; };
  task.every(500, () => { const k = printerKey(); if (k !== lastKey) { lastKey = k; queryPrinter(); } });   // SetPrinter

  // ---------------------------------------------------------------- mouse (c/Main mouse, c/Icons icon_clicked)
  function openWins() { main.open({ behind: 'top' }); }
  pane.on('click', (ev) => {
    if (ev.button === 'menu') {
      if (numSelected() === 0 || tempsel) {
        const i = whichRow(ev.y);
        if (i >= 0) { deselectAll(); list[i].selected = true; }
        tempsel = true;
        pane.invalidate();
      }
      postWindowMenu(ev);
      return true;
    }
    const i = whichRow(ev.y);
    if (i < 0) return true;
    if (ev.button === 'select') { deselectAll(); list[i].selected = true; }
    else list[i].selected = !list[i].selected;
    tempsel = false;
    pane.invalidate();
    return true;
  });
  main.on('click', (ev) => {
    if (ev.button === 'menu' || !enabled) return true;
    if (ev.iconIndex === 3) {              // Defaults: PSPrinterDefaults -> PSPrinterDefaulted
      (async () => { await writeDefaults(printerFile, printerType); await readPrinterFile(); })();
    } else if (ev.iconIndex === 2) {       // Save: write the file, PSPrinterModified
      if (!printerFile) return true;
      const out = list.map((f) => (f.foreign == null ? f.local : `${f.local} ${f.foreign} ${f.encoding || DEFAULT_ENCODING}`));
      try { vfs.writeFile(printerFile, out.join('\n') + (out.length ? '\n' : ''), { filetype: 0xFFF }); } catch (e) { task.reportError(e.message); }
    }
    return true;
  });
  task.onMessage('MenusDeleted', () => {
    if (tempsel) { deselectAll(); tempsel = false; pane.invalidate(); }
  });

  // ---------------------------------------------------------------- menus (c/Menu)
  const selectionOf = () => list.filter((f) => f.selected);
  function fontMenu() {       // Font_ListFonts menu (bit 19): families with style submenus
    const fams = new Map();
    for (const n of fontNames) {
      const [fam, ...rest] = n.split('.');
      if (!fams.has(fam)) fams.set(fam, []);
      if (rest.length) fams.get(fam).push(rest.join('.'));
    }
    const add = (name) => {
      let i = list.findIndex((f) => f.local === name);
      if (i < 0) { list.push({ local: name, foreign: null, encoding: '', selected: false }); i = list.length - 1; }
      deselectAll(); list[i].selected = true; tempsel = true;
      fixExtent(i === list.length - 1);
      ensureVisible(i);
      pane.invalidate();
    };
    return new Menu(msg('nAdd'), [...fams].map(([fam, styles]) => (styles.length
      ? { text: fam, submenu: new Menu(fam, styles.map((s) => ({ text: s, action: () => add(`${fam}.${s}`) }))), action: () => add(`${fam}.${styles[0]}`) }
      : { text: fam, action: () => add(fam) })));
  }
  function postWindowMenu(ev) {
    if (!enabled) return;
    const sel = selectionOf();
    const first = sel[0] ?? null;
    const typeSame = sel.every((f) => (f.foreign == null) === (first?.foreign == null));
    const mapSame = typeSame && sel.every((f) => f.foreign === first?.foreign);
    const encSame = typeSame && sel.every((f) => f.encoding === first?.encoding);
    const mapped = !!first && typeSame && first.foreign != null;
    const titleSel = sel.length <= 1 ? msg('nFont') : msg('nSeln');
    // make_mapmenu: the distinct PostScript names in the list, sorted, then a writable entry
    const names = [...new Set(list.filter((f) => f.foreign != null).map((f) => f.foreign))].sort();
    const inList = mapped && mapSame && names.includes(first.foreign);
    const setMap = (name) => { if (!name) return; for (const f of selectionOf()) { f.foreign = name; f.encoding ||= ''; } pane.invalidate(); };
    const mapMenu = new Menu(msg('nMap'), [
      ...names.map((n) => ({ text: n, ticked: mapped && mapSame && first.foreign === n, action: () => setMap(n) })),
      { text: '', ticked: mapped && mapSame && !inList, writable: { value: mapped && mapSame && !inList ? first.foreign : '', maxLen: 100, validation: 'A~ ' }, action: (e) => setMap(e.value) },
    ]);
    const encMenu = new Menu(msg('nEnc'), ENCODINGS.map((n) => ({
      text: n, ticked: mapped && encSame && first.encoding === n,
      action: () => { for (const f of selectionOf()) if (f.foreign != null) f.encoding = n; pane.invalidate(); },
    })));
    const encOK = sel.length > 0 && mapped;
    const selMenu = new Menu(titleSel, [
      { text: msg('mDownload'), ticked: !!first && typeSame && first.foreign == null, action: () => { for (const f of selectionOf()) f.foreign = null; pane.invalidate(); } },
      { text: msg('nMap'), ticked: mapped && mapSame, submenu: mapMenu, shaded: sel.length === 0 },
      { text: msg('nEnc'), ticked: encOK && encSame && ENCODINGS.includes(first.encoding), submenu: encMenu, shaded: !encOK },
      { text: msg('mDelete'), action: () => { list = list.filter((f) => !f.selected); tempsel = false; fixExtent(); } },
    ]);
    const m = new Menu(msg('nWindow'), [
      { text: titleSel, submenu: selMenu, shaded: sel.length === 0 },
      { text: msg('mSelAll'), shaded: list.length === 0, action: () => { for (const f of list) f.selected = true; if (list.length) tempsel = false; pane.invalidate(); } },
      { text: msg('mClearSel'), shaded: sel.length === 0, action: () => { deselectAll(); tempsel = false; pane.invalidate(); } },
      { text: msg('nAdd'), submenu: () => fontMenu() },
    ]);
    m.help = msg('panehelp');
    wimp.menus.open(m, ev.sx - 32, ev.sy + 16, { task });
  }

  let fontNames = [];
  try {
    const fj = await (await fetch('assets/fonts/fonts.json')).json();
    fontNames = Object.keys(fj.fonts ?? {}).sort();
  } catch { /* */ }

  // ---------------------------------------------------------------- icon bar
  const info = () => {
    const w = wimp.createWindowFromTemplate(tpl, 'ProgInfo', {}, task);
    w.icons[0]?.setState({ deleted: true });
    w.helpText = msg('infohelp');
    w.on('menuclosed', () => w.delete());
    return w;
  };
  const iconMenu = () => new Menu(msg('nIcon'), [
    { text: msg('mInfo'), submenu: info, help: msg('menuhelp0') },
    { text: msg('mQuit'), action: () => task.quit(), help: msg('menuhelp1') },
  ]);
  task.addIconbarIcon({
    sprite: msg('iconname'), side: 'right', help: msg('iconhelp'),
    onClick: () => openWins(),
    menu: iconMenu,
  });
  task.onMessage('Quit', () => task.quit());
  task.on('run', () => openWins());

  lastKey = printerKey();
  await queryPrinter();

  task.fontprint = {
    get list() { return list; }, get enabled() { return enabled; }, get file() { return printerFile; },
    main, pane, requery: queryPrinter,
  };
}
