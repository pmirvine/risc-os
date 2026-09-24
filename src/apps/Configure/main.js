// !Configure (RISC OS 3.71, Sources/SystemRes/Configure c/*): the "Configuration" window of
// icons, each opening a settings window from the real Templates. As in 3.71, most windows change
// the setting immediately (the CMOS); Screen and Fonts have Set / Cancel (/ Default). Settings the
// browser desktop can honour are applied through os.config (see src/core/config.js); the others are
// remembered in os.config.values (persisted) and shown again next time.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { loadTemplates } from '../../core/templates.js';
import { loadMessages } from '../../core/messages.js';
import { saveAs, reportError } from '../../core/dialogs.js';
import { IF } from '../../core/templates.js';
import { os } from '../../core/os.js';

const TEXTURES = 'BootResources:Configure.Textures';
const VOICES = ['WaveSynth-Beep', 'StringLib-Soft', 'StringLib-Pluck', 'StringLib-Steel', 'StringLib-Hard', 'Percussion-Soft', 'Percussion-Medium', 'Percussion-Snare', 'Percussion-Noise'];
const MOUSE_TYPES = ['Quadrature mouse', 'Microsoft serial mouse', 'Mouse Systems serial mouse', 'PS/2 mouse'];
const BLANK = [0, 30, 60, 120, 300, 600, 900, 1800];     // seconds (0 = Off; BLT0..BLT6)
const SPIN = [0, 1, 2, 5];

// Defaults for the settings core does not know about (CMOS defaults of a 3.71 RiscPC)
const DEF = {
  floppies: 1, hdST506: 0, hdIDE: 1, hdSCSI: 0, cdROM: 1, spindown: 0,
  printerPort: 1, printerIgnore: true, printerIgnoreChar: 10,
  mouseStep: 2, mouseType: 0,
  keyDelay: 32, keyRepeat: 8, capsLock: 1,
  memScreen: 1200, memHeap: 32, memRMA: 0, memFontCache: 64, memFontMax: 256, memSprites: 0, memRAMDisc: 0,
  voice: 1, sound16: true,
  monitor: 'Acorn AKF60', screenColours: 5, blankDelay: 0, textureLighter: false,
  fontAA: 12, fontCache: 24, fontSubH: 0, fontSubV: 0,
  interactiveCopy: true, tools2D: false,
  romApps: { Alarm: false, Calc: false, Chars: false, Configure: false, Draw: false, Edit: false, Help: false, Paint: false, BatMgr: false },
  lockPassword: null, locked: false,
};

export default async function start(task, ctx) {
  const cfg = os.config;
  const V = cfg.values;
  const get = (k) => (V[k] ?? DEF[k]);
  const store = (k, v) => { V[k] = v; cfg.save(); };
  const [tpl, tpl2d, M, spriteArea, monitors] = await Promise.all([
    loadTemplates('assets/templates/Configure.json'),
    loadTemplates('assets/templates/Configure.Templat2D.json'),
    loadMessages('Configure'),
    os.sprites.loadManifest('Configure', 'Sprites22'),
    fetch(new URL('./monitors.json', import.meta.url)).then((r) => r.json()).catch(() => []),
  ]);
  const m = (t, ...a) => M.lookup(t, ...a);
  // !System's icon comes from the Wimp pool (IconSprites by its !Boot) - make sure it is there
  if (!os.sprites.get('!system')) await os.sprites.addManifest('System', '!Sprites22').catch(() => {});

  // 2D-only templates (Printer, Apps) upgraded to the 3D look of the rest
  const upgraded = (name, fix) => {
    const t = structuredClone(tpl2d.windows[name.toLowerCase()]);
    fix?.(t.icons);
    return t;
  };
  const R = (ic, v) => { ic.validation = v; ic.flags = (ic.flags | IF.border) >>> 0; };
  const templates = {
    printer: upgraded('Printer', (I) => { R(I[0], 'R4'); }),
    apps: upgraded('Apps', (I) => { R(I[16], 'R5,3'); R(I[17], 'R5,3'); I[16].flags = (I[16].flags | IF.filled | IF.hcentre) >>> 0; I[17].flags = (I[17].flags | IF.filled | IF.hcentre) >>> 0; }),
  };

  const windows = new Map();      // name -> Window
  let main = null;
  let children = 0;

  // ------------------------------------------------------------------ helpers
  function create(name, token) {
    const src = templates[name.toLowerCase()] ?? tpl;
    const w = wimp.createWindowFromTemplate(src, name, { spriteArea }, task);
    w.on('helprequest', (ev) => {
      if (ev.icon) {
        const base = token + ev.icon.handle;
        ev.text = M.has(base + (ev.icon.selected ? 'S' : '') + (ev.icon.shaded ? 'D' : '')) ? m(base + (ev.icon.selected ? 'S' : '') + (ev.icon.shaded ? 'D' : ''))
          : M.has(base) ? m(base) : m(token);
      } else ev.text = m(token);
    });
    return w;
  }
  const sel = (w, i, on) => w.icons[i].setState({ selected: !!on });
  const text = (w, i, t) => { if (w.icons[i].text !== String(t)) w.icons[i].setText(String(t)); };
  const shade = (w, i, on) => w.icons[i].setState({ shaded: !!on });
  /** pop-up menu to the right of an icon (open_button_menu) */
  const popup = (w, i, menu, ev) => {
    const p = w.workToScreen(w.icons[i].bbox.x1, ev?.y ?? w.icons[i].bbox.y0);
    wimp.menus.open(menu, p.x, p.sy ?? (ev?.sy ?? p.y) - 8, { task });
  };
  const step = (ev, n) => (ev.button === 'adjust' ? -n : n);

  /** open a child window: cascaded from the main window as Configure does */
  function openChild(name, build, ev) {
    let w = windows.get(name);
    const fresh = !w;
    if (fresh) { w = build(); windows.set(name, w); w._cfgName = name; }
    else w._refresh?.();
    if (!w.isOpen && main) {
      children = children % 7 + 1;
      w.open({ x: main.x + children * 25, y: main.y, behind: 'top' });
    } else w.open({ behind: 'top' });
    if (ev?.button === 'adjust' && main) { closeMain(); }
    return w;
  }
  function childClose(w) {
    w.on('close', (ev) => {
      ev.preventDefault();
      w.close();
      if (ev.button === 'adjust' && !main?.isOpen) openMain({ x: w.x, y: w.y });
    });
  }

  // ------------------------------------------------------------------ main window
  const MAIN_ITEMS = [
    ['HardDiscs', buildHardDiscs], ['Floppies', buildFloppies], [null], ['Printer', buildPrinter],
    ['Mouse', buildMouse], ['Keyboard', buildKeyboard], ['Memory', buildMemory], ['Sound', buildSound],
    ['Screen', buildScreen], ['Fonts', buildFonts], ['WimpFlags', buildWimpFlags], ['Apps', buildApps],
    ['System', buildSystem], ['Lock', buildLock],
  ];
  function lockUpdate() {
    if (!main) return;
    const locked = !!get('locked');
    MAIN_ITEMS.forEach(([n], i) => { if (i !== 13) shade(main, i, n == null || locked); });
  }
  function openMain(at) {
    if (!main) {
      main = create('Main', 'MA');
      main.on('click', (ev) => {
        if (ev.button === 'menu') { wimp.menus.openAt(mainMenu(), ev, { task }); return true; }
        const i = ev.icon?.handle ?? -1;
        const item = MAIN_ITEMS[i];
        if (!item?.[0] || ev.icon.shaded) return true;
        openChild(item[0], item[1], ev);
        return true;
      });
      main.on('close', (ev) => { ev.preventDefault(); quit(); });
      main.on('dataload', (ev) => { const f = ev.files?.[0]; if (f?.filetype === 0xFF2) { loadFile(f.path); return true; } });
      lockUpdate();
    }
    main.open({ ...(at ?? { x: Math.round((wimp.width - main.w) / 2), y: Math.round((wimp.height - main.h) / 2 - 60) }), behind: 'top' });
  }
  function closeMain() { if (main) { main.delete(); main = null; } }

  let infoWin = null;
  const mainMenu = () => new Menu(m('MMenuT'), [
    { text: 'Info', help: m('MHMAIN0'), submenu: () => {
      if (!infoWin) {
        infoWin = create('ProgInfo', 'INFO');
        text(infoWin, 5, m('C'));
        text(infoWin, 7, m('VER'));
      }
      return infoWin;
    } },
    { text: 'Save', help: m('MHMAIN1'), submenu: () => saveAs({ task, filename: m('fname'), filetype: 0xFF2, getData: async () => JSON.stringify({ configure: 1, values: V }, null, 1) }) },
    { text: 'Quit', help: m('MHMAIN2'), action: () => quit() },
  ]);

  async function loadFile(path) {
    try {
      // a CMOS RAM image saved by !SaveCMOS / *SaveCMOS (240 bytes): load it as *LoadCMOS does
      if (os.vfs.stat(path)?.size === 240) {
        await os.cli.run(`LoadCMOS ${path}`);
        for (const w of windows.values()) w._refresh?.();
        return;
      }
      const txt = await os.vfs.readText(path);
      const j = JSON.parse(txt);
      if (!j?.values) throw new Error();
      Object.assign(V, j.values);
      cfg.save(); cfg.apply();
      for (const w of windows.values()) w._refresh?.();
    } catch { reportError(`'${os.vfs.leaf(path)}' is not a configuration file`, { appName: 'Configure' }); }
  }

  function quit() {
    for (const w of windows.values()) w.delete();
    windows.clear();
    closeMain();
    task.quit();
  }

  // ================================================================== Discs
  function buildHardDiscs() {
    const w = create('HardDiscs', 'HD');
    // ST506 (2-5), IDE (8-11), SCSI (18-23), CD (27-32): drive sprites shown up to the count
    const groups = [
      { key: 'hdST506', icons: [2, 3], up: 4, down: 5, max: 2 },
      { key: 'hdIDE', icons: [8, 9], up: 10, down: 11, max: 2 },
      { key: 'hdSCSI', icons: [18, 19, 20, 21], up: 22, down: 23, max: 4 },
      { key: 'cdROM', icons: [27, 28, 29, 30], up: 31, down: 32, max: 4 },
    ];
    const cur = {};
    const show = () => {
      for (const g of groups) g.icons.forEach((ic, k) => w.icons[ic].setState({ deleted: k >= cur[g.key] }));
      const s = cur.spindown;
      text(w, 14, s ? m('SPIN' + s) : m('SPIN0'));
    };
    w._refresh = () => { for (const g of groups) cur[g.key] = get(g.key); cur.spindown = get('spindown'); show(); };
    w._refresh();
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const i = ev.icon?.handle;
      for (const g of groups) {
        const d = i === g.up ? 1 : i === g.down ? -1 : 0;
        if (d) cur[g.key] = Math.max(0, Math.min(g.max, cur[g.key] + step(ev, d)));
      }
      if (i === 13 || i === 15) {
        const k = SPIN.indexOf(cur.spindown), d = step(ev, i === 15 ? 1 : -1);
        cur.spindown = SPIN[Math.max(0, Math.min(SPIN.length - 1, k + d))];
      }
      if (i === 24) {
        wimp.reportError(m('DiscConf'), { appName: 'Configure', category: 'warning', cancel: true }).then((r) => {
          if (r !== 1) return;
          for (const g of groups) store(g.key, cur[g.key]);
          store('spindown', cur.spindown);
        });
      }
      show();
      return true;
    });
    childClose(w);
    return w;
  }

  function buildFloppies() {
    const w = create('Floppies', 'FL');
    let n;
    const show = () => [2, 3, 4, 5].forEach((ic, k) => w.icons[ic].setState({ deleted: k >= n }));
    w._refresh = () => { n = get('floppies'); show(); };
    w._refresh();
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const i = ev.icon?.handle;
      if (i === 6 || i === 7) { n = Math.max(0, Math.min(4, n + step(ev, i === 6 ? 1 : -1))); show(); }
      if (i === 8) {
        wimp.reportError(m('DiscConf'), { appName: 'Configure', category: 'warning', cancel: true }).then((r) => { if (r === 1) store('floppies', n); });
      }
      return true;
    });
    childClose(w);
    return w;
  }

  // ================================================================== Printer
  function buildPrinter() {
    const w = create('Printer', 'PR');
    const radios = [2, 3, 4, 5];       // None, Parallel, Serial, Net
    w._refresh = () => {
      radios.forEach((ic, k) => sel(w, ic, get('printerPort') === k));
      sel(w, 6, get('printerIgnore'));
      text(w, 7, get('printerIgnoreChar'));
    };
    w._refresh();
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const i = ev.icon?.handle;
      if (radios.includes(i)) { store('printerPort', radios.indexOf(i)); w._refresh(); }
      if (i === 6) { store('printerIgnore', !get('printerIgnore')); w._refresh(); }
      return true;
    });
    const setChar = () => { const v = parseInt(w.icons[7].text, 10); if (v >= 0 && v <= 255) store('printerIgnoreChar', v); w._refresh(); };
    w.on('key', (ev) => { if (ev.code === 13) { setChar(); return true; } });
    w.on('losecaret', setChar);
    childClose(w);
    return w;
  }

  // ================================================================== Mouse
  function buildMouse() {
    const w = create('Mouse', 'MO');
    const speed = [3, 4, 5, 6, 7];
    const fields = [
      { key: 'dragDelay', cmd: 'WimpDragDelay', field: 10, down: 9, up: 11, min: 1, max: 255 },
      { key: 'dragMove', cmd: 'WimpDragMove', field: 14, down: 13, up: 15, min: 1, max: 255 },
      { key: 'doubleClickDelay', cmd: 'WimpDoubleClickDelay', field: 18, down: 17, up: 19, min: 1, max: 255 },
      { key: 'doubleClickMove', cmd: 'WimpDoubleClickMove', field: 22, down: 21, up: 23, min: 1, max: 255 },
    ];
    const setField = (f, v) => { if (v >= f.min && v <= f.max) cfg.set(f.cmd, v); text(w, f.field, cfg.get(f.key)); };
    w._refresh = () => {
      speed.forEach((ic, k) => sel(w, ic, get('mouseStep') === k + 1));
      for (const f of fields) text(w, f.field, cfg.get(f.key));
      text(w, 25, MOUSE_TYPES[get('mouseType')] ?? m('NoMouse'));
    };
    w._refresh();
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const i = ev.icon?.handle;
      if (speed.includes(i)) { store('mouseStep', speed.indexOf(i) + 1); w._refresh(); }
      for (const f of fields) {
        if (i === f.up || i === f.down) setField(f, cfg.get(f.key) + step(ev, i === f.up ? 1 : -1));
      }
      if (i === 24) {
        popup(w, 24, new Menu(m('MTitle'), MOUSE_TYPES.map((t, k) => ({
          text: t, help: m('MHMOUSE'), ticked: () => get('mouseType') === k,
          action: async () => {
            if (k === get('mouseType')) return;
            const r = await wimp.reportError(m('MousConf').replace('%s', t), { appName: 'Configure', title: m('Warn'), category: 'warning', cancel: true });
            if (r === 1) { store('mouseType', k); w._refresh(); }
          },
        }))), ev);
      }
      return true;
    });
    const commit = (ic) => { const f = fields.find((q) => q.field === ic?.handle); if (f) setField(f, parseInt(ic.text, 10)); };
    w.on('key', (ev) => { if (ev.code === 13) { commit(ev.icon); return true; } });
    w.on('losecaret', () => { for (const f of fields) commit(w.icons[f.field]); });
    childClose(w);
    return w;
  }

  // ================================================================== Keyboard
  function buildKeyboard() {
    const w = create('Keyboard', 'KE');
    const caps = [15, 16, 17];     // On, Off, Shift caps
    const upd = () => {
      sel(w, 2, get('keyRepeat') > 0);
      text(w, 5, get('keyDelay'));
      text(w, 10, get('keyRepeat'));
      for (const i of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) shade(w, i, get('keyRepeat') === 0);
      caps.forEach((ic, k) => sel(w, ic, get('capsLock') === k));
    };
    w._refresh = upd;
    upd();
    const setv = (k, v) => { if (v >= 1 && v <= 255) store(k, v); upd(); };
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const i = ev.icon?.handle;
      if (i === 2) { if (get('keyRepeat') > 0) { store('keyRepeatOld', get('keyRepeat')); store('keyRepeat', 0); } else store('keyRepeat', V.keyRepeatOld || 8); upd(); }
      if (i === 4 || i === 6) setv('keyDelay', get('keyDelay') + step(ev, i === 6 ? 1 : -1));
      if (i === 9 || i === 11) setv('keyRepeat', get('keyRepeat') + step(ev, i === 11 ? 1 : -1));
      if (caps.includes(i)) { store('capsLock', caps.indexOf(i)); upd(); }
      return true;
    });
    const commit = () => { setv('keyDelay', parseInt(w.icons[5].text, 10)); if (get('keyRepeat') > 0) setv('keyRepeat', parseInt(w.icons[10].text, 10)); };
    w.on('key', (ev) => { if (ev.code === 13) { commit(); return true; } });
    w.on('losecaret', commit);
    childClose(w);
    return w;
  }

  // ================================================================== Memory
  function buildMemory() {
    const w = create('Memory', 'ME');
    const rows = ['memScreen', 'memHeap', 'memRMA', 'memFontCache', 'memFontMax', 'memSprites', 'memRAMDisc'];
    const unit = [4, 4, 4, 4, 4, 4, 4];
    w._refresh = () => rows.forEach((k, r) => text(w, 14 + r, get(k)));
    w._refresh();
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const i = ev.icon?.handle;
      let r = -1, d = 0;
      if (i >= 7 && i <= 13) { r = i - 7; d = -1; }
      if (i >= 21 && i <= 27) { r = i - 21; d = 1; }
      if (r >= 0) {
        const v = Math.max(0, get(rows[r]) + step(ev, d) * unit[r] * (r === 0 ? 40 : 1));
        store(rows[r], v); w._refresh();
      }
      return true;
    });
    const commit = () => rows.forEach((k, r) => { const v = parseInt(w.icons[14 + r].text, 10); if (v >= 0) store(k, v); });
    w.on('key', (ev) => { if (ev.code === 13) { commit(); w._refresh(); return true; } });
    w.on('losecaret', () => { commit(); w._refresh(); });
    childClose(w);
    return w;
  }

  // ================================================================== Sound
  function buildSound() {
    const w = create('Sound', 'SO');
    const bar = w.icons[2], full = { ...w.icons[0].bbox };
    const vols = [0x01, 0x13, 0x25, 0x37, 0x49, 0x5b, 0x6d, 0x7f];
    const upd = () => {
      const v = cfg.get('volume') ?? 7;
      bar.moveTo({ ...full, x1: full.x0 + Math.round((full.x1 - full.x0) * vols[v] / 0x7f) });
      const vc = get('voice');
      text(w, 8, vc);
      text(w, 5, VOICES[vc - 1] ?? '*** None ***');
      sel(w, 10, cfg.get('speaker') !== false);
      sel(w, 11, cfg.get('beepLoud') === false);
      sel(w, 12, cfg.get('beepLoud') !== false);
      sel(w, 15, get('sound16'));
    };
    w._refresh = upd;
    upd();
    const change = (k, v) => { cfg.values[k] = v; cfg.save(); cfg.apply(); upd(); wimp.beep(); };
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const i = ev.icon?.handle;
      if (i === 1 || i === 3) { const v = (cfg.get('volume') ?? 7) + step(ev, i === 3 ? 1 : -1); if (v >= 0 && v <= 7) change('volume', v); else upd(); }
      if (i === 2 || i === 0) {
        // click / drag in the bar sets the volume directly
        const setAt = (x) => change('volume', Math.max(0, Math.min(7, Math.round((x - full.x0) / (full.x1 - full.x0) * 7))));
        setAt(ev.x);
      }
      if (i === 7 || i === 9) { const v = get('voice') + step(ev, i === 9 ? 1 : -1); if (v >= 1 && v <= 16) { store('voice', v); wimp.beep(); } upd(); }
      if (i === 5 || i === 6) {
        popup(w, 6, new Menu(m('VTitle'), VOICES.map((t, k) => ({ text: t, help: m('MHVOICE'), ticked: () => get('voice') === k + 1, action: () => { store('voice', k + 1); upd(); wimp.beep(); } }))), ev);
      }
      if (i === 10) change('speaker', cfg.get('speaker') === false);
      if (i === 11) change('beepLoud', false);
      if (i === 12) change('beepLoud', true);
      if (i === 15) { store('sound16', w.icons[15].selected); upd(); }
      return true;
    });
    w.on('key', (ev) => { if (ev.code === 13) { const v = parseInt(w.icons[8].text, 10); if (v >= 1 && v <= 16) store('voice', v); upd(); return true; } });
    childClose(w);
    return w;
  }

  // ================================================================== Screen
  function buildScreen() {
    const w = create('Screen', 'SC');
    const texIcons = [22, 23, 24, 25, 26, 27, 28, 29, 30];   // None, 1-7, Random
    const colourNames = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => m('CME' + k));
    const greyDepths = [0, 1, 2, 4];
    let st;
    const monitorOf = (t) => monitors.find((q) => q.title === t) ?? null;
    const resolutions = (mon) => {
      const seen = new Map();
      for (const md of (mon ?? monitorOf('Acorn AKF60'))?.modes ?? []) {
        const k = `${md.x}x${md.y}`;
        if (!seen.has(k) || seen.get(k).hz < md.hz) seen.set(k, md);
      }
      return [...seen.values()].sort((a, b) => ((a.x / a.y > 2) - (b.x / b.y > 2)) || a.x * a.y - b.x * b.y);
    };
    const modeText = (md) => (md ? `${md.width} x ${md.height}` : `${wimp.width} x ${wimp.height}`);
    const curTexture = () => {
      const b = os.pinboard?.backdrop;
      if (!b) return { n: 0, lighter: false };
      const mm = /Textures\.T(\d)(L?)$/i.exec(b.path ?? '');
      return mm ? { n: +mm[1], lighter: !!mm[2] } : { n: -1, lighter: false };
    };
    const show = () => {
      text(w, 1, st.monitor ?? m('MMAUTO'));
      text(w, 4, colourNames[st.colours] ?? m('COLUK'));
      text(w, 7, modeText(st.mode));
      text(w, 10, st.blank ? m('BLT' + (BLANK.indexOf(st.blank) - 1)) : m('Off'));
      texIcons.forEach((ic, k) => sel(w, ic, st.texture === k));
      sel(w, 31, st.lighter);
      shade(w, 31, st.texture === 0);
    };
    w._refresh = () => {
      const t = curTexture();
      st = { monitor: get('monitor'), colours: get('screenColours'), mode: wimp._fixedMode ? { ...wimp._fixedMode } : null,
        blank: get('blankDelay'), texture: V.textureRandom ? 8 : t.n < 0 ? -1 : t.n, lighter: t.lighter };
      show();
    };
    w._refresh();
    const tryTexture = async () => {
      if (st.texture === 0) { os.pinboard?.removeBackdrop(); return; }
      const n = st.texture === 8 ? 1 + Math.floor(Math.random() * 7) : st.texture;
      if (n < 1) return;
      try { await os.cli.run(`Backdrop -tile ${TEXTURES}.T${n}${st.lighter ? 'L' : ''}`); } catch (e) { reportError(e.message, { appName: 'Configure' }); }
    };
    const menuAt = (i, menu, ev) => popup(w, i, menu, ev);
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const i = ev.icon?.handle;
      if (i === 2) {
        menuAt(2, new Menu(m('MMHDR'), [
          { text: m('MMAUTO'), help: m('MHML'), ticked: () => !st.monitor, dotted: true, action: () => { st.monitor = null; show(); } },
          ...monitors.map((mon) => ({ text: mon.title, help: m('MHML'), ticked: () => st.monitor === mon.title, action: () => { st.monitor = mon.title; show(); } })),
        ]), ev);
      } else if (i === 5) {
        menuAt(5, new Menu(m('CMHDR'), colourNames.map((n, k) => ({ text: n, help: m('MHSMCM'), ticked: () => st.colours === k, action: () => { st.colours = k; show(); } }))), ev);
      } else if (i === 8) {
        const list = resolutions(monitorOf(st.monitor));
        const items = [{ text: `${window.innerWidth} x ${window.innerHeight}`, help: m('MHRM'), ticked: () => !st.mode, dotted: true, action: () => { st.mode = null; show(); } }];
        let lastWide = null;
        for (const md of list) {
          const wide = md.x / md.y > 2;
          if (lastWide !== null && wide !== lastWide) items[items.length - 1].dotted = true;
          lastWide = wide;
          items.push({ text: md.name, help: m('MHRM'), ticked: () => st.mode?.width === md.x && st.mode?.height === md.y, action: () => { st.mode = { width: md.x, height: md.y }; show(); } });
        }
        menuAt(8, new Menu(m('RMHDR'), items), ev);
      } else if (i === 11 || i === 12) {
        const k = BLANK.indexOf(st.blank), d = step(ev, i === 12 ? 1 : -1);
        st.blank = BLANK[Math.max(0, Math.min(BLANK.length - 1, (k < 0 ? 0 : k) + d))];
        show();
      } else if (texIcons.includes(i)) {
        st.texture = texIcons.indexOf(i); show();
      } else if (i === 31) {
        st.lighter = !st.lighter; show();
      } else if (i === 32) {
        tryTexture();
      } else if (i === 33) {
        st = { monitor: 'Acorn AKF60', colours: 5, mode: null, blank: 0, texture: 3, lighter: false };
        show();
      } else if (i === 34) {
        if (ev.button === 'adjust') w._refresh(); else w.close();
      } else if (i === 35) {
        store('monitor', st.monitor);
        store('screenColours', st.colours);
        store('blankDelay', st.blank);
        store('textureRandom', st.texture === 8);
        const greys = greyDepths.includes(st.colours);
        const cur = wimp._fixedMode;
        const same = (!cur && !st.mode) || (cur && st.mode && cur.width === st.mode.width && cur.height === st.mode.height);
        if (!same || greys !== !!V.modeGreys) wimp.setMode(st.mode, { greys });
        store('mode', st.mode); store('modeGreys', greys);
        if (st.texture >= 0) tryTexture();
        if (ev.button !== 'adjust') w.close();
      }
      return true;
    });
    return w;
  }

  // ================================================================== Fonts
  function buildFonts() {
    const w = create('Fonts', 'FO');
    let st;
    const fields = [
      { key: 'fontAA', field: 1, down: 2, up: 3, max: 255 },
      { key: 'fontCache', field: 6, down: 7, up: 8, max: 255 },
      { key: 'fontSubH', field: 13, down: 14, up: 15, max: 255 },
      { key: 'fontSubV', field: 18, down: 19, up: 20, max: 255 },
    ];
    const curFont = () => {
      const f = cfg.get('wimpFont');
      return f === 'system' ? null : /^homerton$/i.test(f ?? '') ? 'Homerton.Medium' : f;
    };
    const show = () => {
      for (const f of fields) text(w, f.field, st[f.key]);
      text(w, 25, st.font ?? m('FOSYS'));
    };
    w._refresh = () => { st = { font: curFont() }; for (const f of fields) st[f.key] = get(f.key); show(); };
    w._refresh();
    const fontMenu = async (ev) => {
      const reg = await os.fontreg.ready();     // fonts.json + outline fonts on Font$Path (core fontreg.js)
      const names = reg.names().filter((n) => /^[A-Za-z][\w-]*\.[\w.-]+$/.test(n) && !/^System\./.test(n));
      const fams = new Map();
      for (const n of names) { const [fam, ...rest] = n.split('.'); if (!fams.has(fam)) fams.set(fam, []); fams.get(fam).push(rest.join('.')); }
      const items = [{ text: m('FOSYS'), help: m('MHDESKF'), ticked: () => !st.font, dotted: true, action: () => { st.font = null; show(); } }];
      for (const [fam, styles] of fams) {
        const sub = new Menu(fam, styles.map((s) => ({ text: s, help: m('MHDESKF'), ticked: () => st.font === `${fam}.${s}`, action: () => { st.font = `${fam}.${s}`; show(); } })));
        items.push({ text: fam, help: m('MHDESKF'), ticked: () => st.font?.startsWith(fam + '.'), submenu: sub, action: () => { st.font = `${fam}.${styles.includes('Medium') ? 'Medium' : styles[0]}`; show(); } });
      }
      popup(w, 26, new Menu('Font', items), ev);
    };
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const i = ev.icon?.handle;
      for (const f of fields) if (i === f.up || i === f.down) { st[f.key] = Math.max(0, Math.min(f.max, st[f.key] + step(ev, i === f.up ? 1 : -1))); show(); }
      if (i === 26 || i === 25) fontMenu(ev);
      if (i === 36) { if (ev.button === 'adjust') w._refresh(); else w.close(); }
      if (i === 35) {
        for (const f of fields) store(f.key, st[f.key]);
        const want = st.font ?? 'system';
        if (want !== cfg.get('wimpFont') && !(want === 'Homerton.Medium' && cfg.get('wimpFont') === 'homerton')) {
          const val = want === 'Homerton.Medium' ? 'homerton' : want;
          const apply = () => { cfg.values.wimpFont = val; cfg.save(); cfg.apply(); };
          apply();
          // re-layout once the outline font file has arrived (a font from the disc is converted first)
          if (val !== 'system') os.fontreg.load(want).then(() => document.fonts?.load(os.fonts.css)).then(apply).catch(() => {});
        }
        if (ev.button !== 'adjust') w.close();
      }
      return true;
    });
    w.on('dataload', (ev) => {
      const f = ev.files?.[0];
      if (!f || !/^!Fonts$/i.test(os.vfs.leaf(f.path))) reportError('Only a !Fonts directory can be merged here', { appName: 'Configure' });
      return true;
    });
    return w;
  }

  // ================================================================== Window manager
  function buildWimpFlags() {
    const w = create('WimpFlags', 'WI');
    const bits = { 3: 0, 4: 1, 5: 2, 6: 3, 11: 5, 12: 6, 14: 7 };
    const flags = () => cfg.get('wimpFlags');
    const setFlags = (f) => cfg.set('WimpFlags', f & 255);
    const upd = () => {
      const f = flags();
      sel(w, 0, get('interactiveCopy'));
      for (const [ic, b] of Object.entries(bits)) sel(w, +ic, f & (1 << b));
      sel(w, 13, !(f & 16));
      sel(w, 15, cfg.get('textured'));
      sel(w, 16, get('tools2D'));
    };
    w._refresh = upd;
    upd();
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const i = ev.icon?.handle;
      if (i === 0) { store('interactiveCopy', !get('interactiveCopy')); if (os.filer?.options) os.filer.options.verbose = get('interactiveCopy'); }
      if (i in bits) setFlags(flags() ^ (1 << bits[i]));
      if (i === 7) setFlags(flags() | 15);
      if (i === 8) setFlags(flags() & ~15);
      if (i === 13) setFlags(flags() ^ 16);
      if (i === 15) cfg.set('Textured', cfg.get('textured') ? 'Off' : 'On');
      if (i === 16) store('tools2D', !get('tools2D'));
      upd();
      return true;
    });
    childClose(w);
    return w;
  }

  // ================================================================== Application auto-start
  function buildApps() {
    const w = create('Apps', 'AP');
    const opts = { 0: 'Alarm', 2: 'Calc', 4: 'Chars', 6: 'Configure', 8: 'Draw', 10: 'Edit', 12: 'Help', 14: 'Paint', 18: 'BatMgr' };
    const ra = () => ({ ...DEF.romApps, ...(V.romApps ?? {}) });
    const upd = () => { const r = ra(); for (const [ic, n] of Object.entries(opts)) sel(w, +ic, r[n]); };
    w._refresh = upd;
    upd();
    for (const i of [20, 21]) w.icons[i]?.setState({ deleted: true });     // !PrinterDP: not in this ROM
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const i = ev.icon?.handle;
      const r = ra();
      const n = opts[i] ?? opts[i - 1];
      if (n) r[n] = !r[n];
      if (i === 16 || i === 17) for (const k of Object.values(opts)) r[k] = i === 16;
      if (i === 16 || i === 17) w.icons[i].setState({ selected: false });
      store('romApps', r);
      upd();
      return true;
    });
    childClose(w);
    return w;
  }

  // ================================================================== System, Lock
  function buildSystem() {
    const w = create('System', 'SY');
    w.on('dataload', (ev) => {
      const f = ev.files?.[0];
      if (!f || !/^!System$/i.test(os.vfs.leaf(f.path))) reportError('Only a !System directory can be merged here', { appName: 'Configure' });
      return true;
    });
    childClose(w);
    return w;
  }

  function buildLock() {
    const w = create('Lock', 'LO');
    const hash = (s) => { let h = 5381; for (const c of s) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h.toString(16); };
    const status = () => (get('locked') ? 2 : get('lockPassword') ? 1 : 0);
    const upd = () => {
      const s = status();
      text(w, 8, m('LOL' + s));
      for (const i of [1, 3, 5]) text(w, i, '');
      shade(w, 1, s === 0);
      shade(w, 6, s === 2); shade(w, 3, s === 2); shade(w, 5, s === 2);
    };
    w._refresh = upd;
    upd();
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      const i = ev.icon?.handle;
      const old = w.icons[1].text, n1 = w.icons[3].text, n2 = w.icons[5].text;
      const oldOk = !get('lockPassword') || hash(old) === get('lockPassword');
      if (i === 6) {       // change password
        if (!oldOk) { reportError(m('LONOPASS'), { appName: 'Configure' }); return true; }
        if (n1.length < 5 || n1 !== n2) { reportError(get('lockPassword') ? m('LONoNew') : m('LOFirst'), { appName: 'Configure' }); return true; }
        store('lockPassword', hash(n1)); upd();
      } else if (i === 7) { w.close(); }
      else if (i === 8) {  // lock / unlock
        const s = status();
        if (s === 0) { reportError(m('LOFirst'), { appName: 'Configure' }); return true; }
        if (s === 2) { if (!oldOk || !old) { reportError(m('LONOPASS'), { appName: 'Configure' }); return true; } store('locked', false); }
        else store('locked', true);
        upd(); lockUpdate();
        for (const [n, win] of windows) if (n !== 'Lock' && get('locked')) win.close();
      }
      return true;
    });
    w.on('close', (ev) => { ev.preventDefault(); w.close(); });
    return w;
  }

  // ------------------------------------------------------------------ start up
  task.on('run', ({ file }) => { openMain(); if (file) loadFile(file); });
  task.onMessage('Quit', () => quit());
  task.onMessage('DataOpen', (msg) => { if (msg.filetype === 0xFF2) { loadFile(msg.path); return true; } });
  openMain();
  if (ctx.file && os.vfs.stat(ctx.file)?.filetype === 0xFF2) loadFile(ctx.file);
}
