// !T1ToFont 1.28 - Type 1 to Acorn font converter. A port of Sources/Printing/T1ToFont/c/frontend
// (RISC_OSlib dbox front end) over the conversion engine in type1.js.
//
// Icon bar icon: Select opens the "Type 1 to Acorn Font Converter" box (ToAcorn template); its menu
// has Info and Quit. Drop a Type 1 font (plain PFA, PC PFB or Mac resource format) and optionally an AFM
// file on the box; the font name is guessed from /FontName. Encoding and Save in are pop-up menus (from
// Messages "Encodings" and the Font$Path directories). OK writes <Save in>.<Font name>.Outlines(0) and
// IntMetrics (IntMetric0 for Base0 encodings), an Encoding file for non-Base encodings, and with
// "Keep PostScript" copies of the Type 1 and AFM files. The box stays open, as in the original.
import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { loadTemplates } from '../../core/templates.js';
import { loadMessages } from '../../core/messages.js';
import { os } from '../../core/os.js';
import * as T1 from './type1.js';
import base0 from './base0.js';

const MAINBOX = { OK: 0, TYPE1: 2, AFM: 4, ENCNAME: 6, SAVEIN: 8, FONTNAME: 10, KEEPPS: 11, ENCMENU: 12, SAVEMENU: 13 };
const decode = (b) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return s; };

export default async function start(task, ctx) {
  const { vfs, sysvars } = os;
  const [tpl, M] = await Promise.all([loadTemplates('assets/templates/T1ToFont.json'), loadMessages('T1ToFont')]);
  const msg = (t) => (M.has(t) ? M.lookup(t) : t);
  /** msgs_lookup + printf: %s / %d / %X in order. */
  const fmt = (t, ...a) => { let i = 0; return msg(t).replace(/%([sdX])/g, (_, c) => { const v = a[i++]; return c === 'X' ? Number(v).toString(16).toUpperCase() : String(v ?? ''); }); };
  const werr = (t, ...a) => task.reportError(fmt(t, ...a));

  // !Run: T1ToFont$Dir (set by the app manager) and T1ToFont$Path
  sysvars.set('T1ToFont$Path', '<T1ToFont$Dir>.,<Font$Path>', 'macro');
  task.name = msg('Title');                        // wimpt_init(msgs_lookup("Title"))

  // ------------------------------------------------------------------ encodings (process_encoding_names)
  const encItems = [];                               // {text, file (null = font specific)}
  for (const tag of msg('Encodings').split(',')) {
    const v = msg(tag.trim()), eq = v.indexOf('=');
    if (eq < 0) continue;
    const file = v.slice(eq + 1);
    encItems.push({ text: v.slice(0, eq), file: file === 'fontspecific' ? null : file });
  }
  if (!encItems.length) encItems.push({ text: 'Acorn Extended Latin', file: '/Base0' }, { text: 'Font specific', file: null });

  /** Encoding files are sought as T1ToFont:Encodings.<name> (T1ToFont$Path = app dir, then Font$Path). */
  const pathEntries = (v) => (sysvars.get(v) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  async function loadEncodingText(name) {
    for (const pre of pathEntries('T1ToFont$Path')) {
      const p = `${pre}Encodings.${name}`;
      try { if (vfs.exists(p) && !vfs.isDir(p)) return await vfs.readText(p); } catch { /* next */ }
    }
    return name === '/Base0' ? base0 : null;          // the ROM's Resources:$.Fonts.Encodings./Base0
  }
  const readEncoding = (name, useBase = true) => T1.readEncoding(name, loadEncodingText, useBase);

  // ------------------------------------------------------------------ dbox values
  let valKeepPS = false, encNumber = 0, savein = '', fontdirNumber = 0;
  /** build_fontdir_string(): the Font$Path elements, trailing '.' removed. */
  const fontDirs = () => pathEntries('Font$Path').flatMap((e) => e.split(' ')).filter(Boolean).map((e) => e.replace(/\.$/, ''));

  const w = task.createWindowFromTemplate(tpl, 'ToAcorn');
  const I = w.icons;
  const setField = (i, t) => { I[i].setText(t); };
  const getField = (i) => I[i].text ?? '';
  function setEnc(n) { encNumber = n; setField(MAINBOX.ENCNAME, encItems[n - 1].text); }
  function setSaveIn(n) { const d = fontDirs(); if (n < 1 || n > d.length) return false; fontdirNumber = n; savein = d[n - 1]; setField(MAINBOX.SAVEIN, savein); return true; }
  setSaveIn(1);
  setEnc(1);
  I[MAINBOX.KEEPPS].setState({ selected: valKeepPS });
  let mainboxOpen = false;

  // ------------------------------------------------------------------ menus
  const infoBox = () => {
    const d = task.createWindowFromTemplate(tpl, 'ProgInfo');
    d.setIconText(4, msg('Version'));
    d.on('menuclosed', () => setTimeout(() => d.delete(), 0));
    return d;
  };
  const iconItems = msg('IconItems').split(',');
  const iconMenu = () => new Menu(msg('IconTitle'), [
    { text: iconItems[0].replace(/^>/, ''), submenu: infoBox },
    { text: iconItems[1], action: () => quit() },
  ]);
  const encMenu = () => new Menu(msg('EncTitle'), encItems.map((e, i) => ({ text: e.text, ticked: () => encNumber === i + 1, action: () => setEnc(i + 1) })));
  const saveMenu = () => {
    const d = fontDirs();
    if (!d.length) return new Menu(msg('SaveTitle'), [{ text: msg('SaveNoDirs').replace(/^~/, ''), shaded: true }]);
    return new Menu(msg('SaveTitle'), d.map((p, i) => ({ text: p, ticked: () => fontdirNumber === i + 1, action: () => setSaveIn(i + 1) })));
  };
  /** mainbox_menu_maker(): which menu depends on the icon clicked. */
  const menuFor = (i) => (i === MAINBOX.ENCNAME || i === MAINBOX.ENCMENU ? encMenu() : i === MAINBOX.SAVEIN || i === MAINBOX.SAVEMENU ? saveMenu() : iconMenu());

  // ------------------------------------------------------------------ importing files
  let lastType1 = null;
  function fillType1(path, bytes) {
    setField(MAINBOX.TYPE1, path);
    wimp.setCaret(w, I[MAINBOX.TYPE1], path.length);
    const name = bytes && T1.getFontName(bytes);
    if (name) setField(MAINBOX.FONTNAME, T1.guessAcornFontName(name));
  }
  /** import_file(): a file dragged from a Filer window. */
  async function importFile(path, filetype, icon = -1) {
    let bytes = null;
    try { bytes = await vfs.readFile(path); } catch { /* */ }
    if (icon !== MAINBOX.TYPE1 && icon !== MAINBOX.AFM) {
      // the original goes by file type (&FF5 = Type 1, else AFM); PFA/PFB files usually arrive untyped
      // from other systems, so the contents decide too
      icon = filetype === T1.FILETYPE_TYPE1 || (bytes && T1.isType1(bytes) && !T1.isAFM(bytes)) ? MAINBOX.TYPE1 : MAINBOX.AFM;
    }
    if (icon === MAINBOX.TYPE1) { lastType1 = path; fillType1(path, bytes); }
    else { setField(MAINBOX.AFM, path); wimp.setCaret(w, I[MAINBOX.AFM], path.length); }
  }
  /** import_data(): data saved from another application, via a scrap file. */
  async function importData(ev) {
    let icon = ev.icon ? I.indexOf(ev.icon) : -1;
    const data = await ev.receive();
    const bytes = typeof data === 'string' ? Uint8Array.from(data, (c) => c.charCodeAt(0) & 255) : new Uint8Array(data ?? []);
    if (icon !== MAINBOX.TYPE1 && icon !== MAINBOX.AFM) icon = ev.filetype === T1.FILETYPE_TYPE1 || T1.isType1(bytes) ? MAINBOX.TYPE1 : MAINBOX.AFM;
    const scrap = sysvars.gstrans(msg(icon === MAINBOX.TYPE1 ? 'Scrap1' : 'Scrap2'));
    setField(icon, '');
    if (!bytes.length) { werr('ImportErr'); return; }
    try { vfs.writeFile(scrap, bytes, { filetype: ev.filetype ?? (icon === MAINBOX.TYPE1 ? T1.FILETYPE_TYPE1 : T1.FILETYPE_AFM) }); } catch { werr('NoWrite', scrap); return; }
    if (icon === MAINBOX.TYPE1) fillType1(scrap, bytes);
    else { setField(MAINBOX.AFM, scrap); wimp.setCaret(w, I[MAINBOX.AFM], scrap.length); }
  }

  // ------------------------------------------------------------------ conversion (MAINBOX_OK)
  const isfile = (p) => { try { const s = p && vfs.stat(p); return !!s && s.type === 'file'; } catch { return false; } };
  const objType = (p) => { try { const s = vfs.stat(p); return !s ? 0 : s.type === 'dir' ? 2 : 1; } catch { return 0; } };
  /** ensure_hier(): base must exist; each dot-separated part of dirs is created as needed. */
  function ensureHier(base, dirs) {
    let buf = base.replace(/\.$/, '');
    if (objType(buf) !== 2) throw new T1.T1Error('DirErr1', buf);
    for (const part of dirs.split('.').filter(Boolean)) {
      buf += '.' + part;
      const t = objType(buf);
      if (t === 0) { try { vfs.mkdir(buf); } catch { throw new T1.T1Error('DirErr2', buf); } if (objType(buf) !== 2) throw new T1.T1Error('DirErr2', buf); }
      else if (t === 1) throw new T1.T1Error('DirErr3', buf);
    }
  }
  const complain = (e) => (e instanceof T1.T1Error ? werr(e.token, ...e.args) : task.reportError(e.message ?? String(e)));
  let busy = false;

  async function doConvert() {
    if (busy) return;
    const useFontMerge = !!os.cli.findRunnable?.('FontMerge');
    let sv = savein;
    if (!sv) { werr('NoSaveDir'); return; }
    if (!useFontMerge && !sv.endsWith('.')) sv += '.';
    const valType1 = getField(MAINBOX.TYPE1).trim();
    let valAfm = getField(MAINBOX.AFM).trim();
    const valFontname = getField(MAINBOX.FONTNAME).trim();
    if (!valType1 && !valAfm) { werr('NoFiles'); return; }
    if (valType1 && !isfile(valType1)) { werr('BadType1', valType1); return; }
    if (valAfm) {
      if (!isfile(valAfm)) { werr('FileOpenR', valAfm); return; }
      if (!T1.isAFM(await vfs.readFile(valAfm))) { werr('NotAFM', valAfm); valAfm = ''; setField(MAINBOX.AFM, ''); }
    }
    if (!valFontname) { werr('NoName'); return; }
    const scrapDir = sysvars.gstrans('<Wimp$ScrapDir>');
    let prefix = sv;
    try {
      if (useFontMerge) { ensureHier(scrapDir, `T1Font.${valFontname}`); prefix = `${scrapDir}.T1Font.`; }
      else ensureHier(sv, valFontname);
    } catch (e) { complain(e); return; }

    busy = true;
    const written = [];
    try {
      const encFile = encItems[encNumber - 1].file;
      let encoding = null, genAfm = null, from = valType1, typeBytes = null;
      const write = (leaf, data, filetype) => { const p = `${prefix}${valFontname}.${leaf}`; vfs.writeFile(p, data, { filetype }); written.push(p); return p; };
      if (valType1) {
        typeBytes = await vfs.readFile(valType1);
        const kind = T1.guessType(typeBytes);
        if (kind !== T1.FILETYPE_TYPE1) {            // preprocess into the scrap file, as the original
          const plain = T1.preprocess(typeBytes, kind);
          from = sysvars.gstrans(msg('Scrap3'));
          vfs.writeFile(from, plain, { filetype: T1.FILETYPE_TYPE1 });
          typeBytes = plain;
        }
        const adobe = await readEncoding('Specials.Adobe');
        const target = encFile ? await readEncoding(encFile) : null;
        const r = T1.convertType1(typeBytes, { encoding: target, adobe, fontName: valFontname, genAfm: !valAfm,
          warn: (t) => task.reportError(msg(t), { category: 'info' }) });
        encoding = r.encoding;
        genAfm = r.genAfm;
        write(T1.fontFileLeaf('Outlines', encoding.alphabet), r.outlines, T1.FILETYPE_FONT);
      }
      // IntMetrics: from the AFM file, or the metrics generated from the Type 1 file
      if (valAfm || genAfm) {
        if (!encoding) {
          if (!encFile) throw new T1.T1Error('EncError');
          encoding = await readEncoding(encFile);
        }
        const specials = { dummies: await readEncoding('Specials.Dummies', false), up: await readEncoding('Specials.Accents_Up', false), down: await readEncoding('Specials.Accents_Dn', false) };
        const afmText = valAfm ? decode(await vfs.readFile(valAfm)) : genAfm;
        write(T1.fontFileLeaf('IntMetrics', encoding.alphabet), T1.makeIntMetrics(afmText, encoding, valFontname, specials), T1.FILETYPE_FONT);
      }
      // not a Base encoding: leave the encoding in the font directory for the Font Manager / printer drivers
      if (encoding && encoding.alphabet === -1) write('Encoding', encoding.toText(), 0xFFF);
      if (valKeepPS) {
        if (valType1) write('Type1', await vfs.readFile(from), T1.FILETYPE_TYPE1);
        if (valAfm) write('AFM', await vfs.readFile(valAfm), T1.FILETYPE_AFM);
      }
      if (from !== valType1) try { vfs.delete(from); } catch { /* */ }
      if (useFontMerge) {
        // Wimp_StartTask "FontMerge <scrap>.T1Font <Save in>": FontMerge is ARM code here, so do its job -
        // merge the new font directory into the chosen fonts directory - and wipe the scrap copy
        const dest = `${savein.replace(/\.$/, '')}`;
        ensureHier(dest, valFontname);
        for (const p of written) await vfs.copy(p, `${dest}.${valFontname}.${vfs.leaf(p)}`);
        try { vfs.delete(`${scrapDir}.T1Font`, { recursive: true, force: true }); } catch { /* */ }
      }
    } catch (e) {
      complain(e);
    } finally { busy = false; }
    task.lastConversion = { savein, fontName: valFontname, files: written };
    task.emit('converted', { ...task.lastConversion });
  }

  // ------------------------------------------------------------------ window events
  w.on('click', (ev) => {
    const i = ev.iconIndex;
    if (ev.button === 'menu') { wimp.menus.openAt(menuFor(i), ev, { task }); return true; }
    if (i === MAINBOX.KEEPPS) { valKeepPS = !valKeepPS; I[MAINBOX.KEEPPS].setState({ selected: valKeepPS }); return true; }
    if (i === MAINBOX.OK) { doConvert(); return true; }
    if (i === MAINBOX.ENCMENU || i === MAINBOX.SAVEMENU) { wimp.menus.openAt(menuFor(i), ev, { task }); return true; }   // the "dubious code": a faked Menu click
    return false;
  });
  w.on('close', () => { w.close(); mainboxOpen = false; return true; });
  w.on('dataload', (ev) => {
    const f = ev.files?.[0];
    if (!f) return false;
    const icon = ev.icon ? I.indexOf(ev.icon) : -1;
    importFile(f.path, f.filetype, icon);
    return true;
  });
  w.on('datasave', (ev) => { importData(ev); return true; });

  function openBox() {
    if (mainboxOpen && w.isOpen) { w.open({ behind: 'top' }); return; }
    w.open({ behind: 'top' });
    mainboxOpen = true;
  }
  function quit() {
    for (const k of ['Scrap1', 'Scrap2', 'Scrap3', 'Scrap4']) { try { const p = sysvars.gstrans(msg(k)); if (vfs.exists(p)) vfs.delete(p); } catch { /* */ } }
    task.quit();
  }

  task.addIconbarIcon({
    sprite: ctx.app.sprite, side: 'right',
    onClick: () => openBox(),
    menu: () => iconMenu(),
    onDataLoad: (ev) => { const f = ev.files?.[0]; if (!f) return false; openBox(); importFile(f.path, f.filetype); return true; },
  });
  task.onMessage('Quit', () => quit());
  task.t1 = { window: w, convert: doConvert, importFile, get savein() { return savein; }, setEnc, setSaveIn, get lastType1() { return lastType1; } };
}
