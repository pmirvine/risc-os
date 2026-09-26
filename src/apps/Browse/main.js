// !Browse start-up: the icon bar icon and its menu (Info, Choices, Quit), the engine and what it asks of the
// desktop (a page's dialogues, <select> menus, downloads, uploads, pop-ups), the hotlist and history, Find,
// the Save boxes and Choices. The windows themselves are ./view.js.
import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { vfs } from '../../core/vfs.js';
import { input } from '../../core/input.js';
import { fonts } from '../../core/fonts.js';
import { choices } from '../../core/choices.js';
import { loadTemplates } from '../../core/templates.js';
import { loadManifest } from '../../core/sprites.js';
import { saveAs, query, infoBox } from '../../core/dialogs.js';
import { hostToRiscos, riscosToHost } from '../../core/hostfs/names.js';
import { Engine } from './engine.js';
import { BrowserWindow, PageTab } from './view.js';
import { readURLFile, uriFile, TYPE_EXT } from './uri.js';

const DEFAULTS = {
  home: 'https://www.riscosopen.org/',
  search: 'https://duckduckgo.com/?q=%s',
  sound: true, toolbar: true, urlbar: true, statusbar: true, alwaysTabs: false, zoom: 1,
  hotlist: [
    { url: 'https://www.riscosopen.org/', title: 'RISC OS Open' },
    { url: 'https://en.wikipedia.org/wiki/RISC_OS', title: 'RISC OS - Wikipedia' },
  ],
};
const MAX_HISTORY = 300;

export default async function start(task, ctx) {
  const [tpl, spr, probe, prefs, hist] = await Promise.all([
    loadTemplates('assets/templates/Bookworm.json'),     // Browse's own Templates, as !Bookworm has them
    loadManifest('Bookworm', 'Sprites'),
    Engine.probe(),
    choices.read('Browse', DEFAULTS),
    choices.read('BrowseHist', { pages: [] }),
  ]);
  let animLength = 0;
  while (spr.has('a' + animLength)) animLength++;

  const app = {
    task, tpl, spr, prefs, probe, animLength,
    engine: probe.mode === 'engine' ? new Engine(probe.info) : null,
    windows: new Set(),
    tabs: new Map(),                 // engine tab id -> PageTab
    hotlist: prefs.hotlist,
    history: hist.pages,             // [{url, title, time}], most recent first
  };
  if (app.engine) app.engine.soundOn = prefs.sound;
  // what Save kept (Set only changes prefs until quitting); the hotlist is always kept
  let saved = { ...prefs };
  const savePrefs = (all = false) => {
    if (all) saved = { ...prefs };
    try { choices.write('Browse', { ...saved, hotlist: app.hotlist }); } catch (e) { task.reportError(e.message); }
  };
  // open hotlist / history lists follow changes
  const refreshLists = () => { for (const w of app.windows) for (const l of Object.values(w._lists ?? {})) l.refresh(); };
  let histTimer = null;
  const saveHistory = () => { clearTimeout(histTimer); histTimer = null; try { choices.write('BrowseHist', { pages: app.history }); } catch { /* read-only disc */ } };

  // ---------------------------------------------------------------- addresses
  app.fixURL = (s) => {
    s = s.trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^:]+:\d+(\/|$)/.test(s)) return s;
    if (/^(localhost|[\d.]+|\[[\d:a-f]+\])(:\d+)?(\/|$)/i.test(s)) return 'http://' + s;
    if (!/\s/.test(s) && /^[^/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(s)) return 'https://' + s;
    return prefs.search.replace('%s', encodeURIComponent(s));
  };
  app.visited = (t) => {
    if (!t.url || /^(about|data|blob):/.test(t.url)) return;
    const i = app.history.findIndex((h) => h.url === t.url);
    const e = { url: t.url, title: t.title || (i >= 0 ? app.history[i].title : '') || t.url, time: Date.now() };
    if (i >= 0) app.history.splice(i, 1);
    app.history.unshift(e);
    app.history.length = Math.min(app.history.length, MAX_HISTORY);
    histTimer ??= setTimeout(saveHistory, 3000);
    refreshLists();
  };
  app.addHot = (t) => {
    if (!t?.url) return;
    const i = app.hotlist.findIndex((h) => h.url === t.url);
    if (i >= 0) app.hotlist.splice(i, 1);
    app.hotlist.unshift({ url: t.url, title: t.title || t.url });
    savePrefs();
    refreshLists();
    for (const w of app.windows) { w.setButtons(); w.note_('Added to your hotlist'); }
  };
  app.readURLFile = readURLFile;
  app.setSound = (on) => { prefs.sound = on; app.engine?.setSound(on); };

  app.newWindow = (url, opts = {}) => {
    const w = new BrowserWindow(app, opts);
    w.newTab(url ?? prefs.home);
    w.focusPage();
    return w;
  };
  app.windowGone = () => { if (!app.windows.size) saveHistory(); };

  // ---------------------------------------------------------------- files for the page
  /** Send RISC OS files to the engine for the page (named as they'd be on the host, with an extension). */
  app.uploadFiles = async (files, bw) => {
    const ids = [];
    for (const f of files) {
      const leaf = f.path.slice(f.path.lastIndexOf('.') + 1);
      let name = riscosToHost({ name: leaf, filetype: f.filetype ?? 0xFFF, load: 0, exec: 0 });
      const m = /^(.+),([0-9a-f]{3})$/i.exec(name);
      if (m) name = m[1] + (TYPE_EXT[parseInt(m[2], 16)] ? '.' + TYPE_EXT[parseInt(m[2], 16)] : '');
      bw?.note_(`Sending ${leaf}...`, 0);
      ids.push(await app.engine.upload(name, await vfs.readFile(f.path)));
    }
    bw?.note_('');
    return ids;
  };

  // ---------------------------------------------------------------- the engine's requests
  const tabOf = (e) => app.tabs.get(e.tab);
  if (app.engine) {
    const E = app.engine;
    E.on('state', (e) => tabOf(e)?.state(e));
    E.on('error', (e) => { const t = tabOf(e); if (t) { t.error = e.message; t.bw.tabChanged(t); } });
    E.on('opened', (e) => {
      if (!task.alive) return;
      const opener = app.tabs.get(e.opener);
      const bw = opener?.bw ?? [...app.windows].at(-1) ?? new BrowserWindow(app);
      // Adjust on a link (a middle click to the page): a tab behind; otherwise, as a pop-up, in front
      const background = performance.now() - (app.adjustAt ?? 0) < 1500;
      bw.newTab(null, { serverTab: e.tab, url: e.url, after: opener, background });
    });
    E.on('closed', (e) => {
      const t = tabOf(e);
      if (!t) return;
      E.frames.delete(e.tab);
      app.tabs.delete(e.tab);
      t.id = null;
      if (e.crashed) { t.loading = false; t.error = 'The browser engine stopped: reload the page to try again'; t.bw.tabChanged(t); return; }
      t.bw.tabGone(t);
    });
    E.on('lost', () => {
      for (const t of app.tabs.values()) { t.id = null; t.error = 'The connection to the browser engine was lost: reload the page to try again'; t.loading = false; t.bw.tabChanged(t); }
      app.tabs.clear();
      E.frames.clear();
    });
    E.on('dialog', (e) => pageDialog(tabOf(e), e));
    E.on('select', (e) => selectMenu(tabOf(e), e));
    E.on('files', (e) => uploadBox(tabOf(e), e));
    E.on('download', (e) => downloadBox(tabOf(e), e));
    E.on('progress', (e) => downloads.get(e.id)?.progress(e));
  }

  const hostOf = (url) => { try { return new URL(url).host || url; } catch { return url ?? ''; } };

  async function pageDialog(t, e) {
    if (!t) return;
    const title = `Message from ${hostOf(e.url || t.url)}`;
    let accept = true, text = '';
    if (e.type === 'alert') await task.reportError(e.message, { title, category: 'info' });
    else if (e.type === 'confirm') accept = (await task.reportError(e.message, { title, category: 'question', cancel: true })) === 1;
    else if (e.type === 'beforeunload') accept = (await query({ task, title: 'Browse', message: 'Leave this page? Changes you made may not be saved.', buttons: ['Leave', 'Stay'] })) === 'Leave';
    else if (e.type === 'prompt') { text = await promptBox(title, e.message, e.value); accept = text != null; }
    t.send({ op: 'dialog', accept, text: text ?? '' });
  }

  function promptBox(title, message, value) {
    return new Promise((resolve) => {
      const w = task.createWindow({
        title, x: Math.round(wimp.width / 2 - 220), y: Math.round(wimp.height / 2 - 70), w: 440, h: 132, extent: { w: 440, h: 132 },
        flags: { title: true, moveable: true, close: true }, returnNext: false,
        icons: [
          { x: 12, y: 10, w: 416, h: 40, text: message.slice(0, 240), validation: 'L', vcentre: false },
          { x: 12, y: 54, w: 416, h: 28, text: value ?? '', button: 'writable', border: true, filled: true, bg: 0, validation: 'R7', maxLen: 1024, name: 'answer' },
          { x: 236, y: 92, w: 88, h: 32, text: 'Cancel', border: true, filled: true, hcentre: true, validation: 'R5,3', button: 'click', name: 'cancel' },
          { x: 332, y: 88, w: 96, h: 38, text: 'OK', border: true, filled: true, hcentre: true, validation: 'R6,3', button: 'click', name: 'ok' },
        ],
      });
      const done = (v) => { w.delete(); resolve(v); };
      const I = w.iconByName('answer');
      w.on('click', (ev) => { if (ev.icon?.name === 'ok') done(I.text); else if (ev.icon?.name === 'cancel') done(null); });
      w.on('key', (ev) => { if (ev.code === 13) { done(I.text); return true; } if (ev.code === 27) { done(null); return true; } });
      w.on('close', (ev) => { ev.preventDefault(); done(null); });
      w.open({ behind: 'top' });
      wimp.setCaret(w, I, I.text.length);
    });
  }

  function selectMenu(t, e) {
    if (!t?.bw?.win.isOpen) return;
    const items = [];
    let group = null;
    e.options.forEach((o, i) => {
      if (o.group !== group) { if (items.length) items[items.length - 1].dotted = true; group = o.group; }
      items.push({ text: (o.text || ' ').slice(0, 60), ticked: i === e.index, shaded: o.disabled, action: () => t.send({ op: 'select', index: i }) });
    });
    if (!items.length) return;
    const r = t.bw.canvas.getBoundingClientRect(), s = wimp.scale ?? 1;
    const sr = wimp.screen.getBoundingClientRect();
    const x = (r.left - sr.left) / s + e.x * r.width / t.bw.canvas.width / s, y = (r.top - sr.top) / s + e.y * r.height / t.bw.canvas.height / s;
    wimp.menus.open(new Menu('Choose', items), Math.round(x), Math.round(y + 24), { task });   // (y: its work area, below its title)
  }

  // uploads: the page's "choose a file" becomes a box to drag files into from the Filer
  function uploadBox(t, e) {
    if (!t) return;
    const w = task.createWindow({
      title: 'Send files to the page', x: Math.round(wimp.width / 2 - 200), y: Math.round(wimp.height / 2 - 80), w: 400, h: 150, extent: { w: 400, h: 150 },
      flags: { title: true, moveable: true, close: true },
      icons: [
        { x: 12, y: 12, w: 376, h: 84, text: e.multiple ? 'Drag the files to send from a Filer window into this box.' : 'Drag the file to send from a Filer window into this box.', border: true, filled: true, bg: 0, hcentre: true, validation: 'R2;L' },
        { x: 296, y: 108, w: 92, h: 32, text: 'Cancel', border: true, filled: true, hcentre: true, validation: 'R5,3', button: 'click', name: 'cancel' },
      ],
    });
    w.helpText = 'The page asked for a file.|MDrag one from a Filer window into this box to send it, or click Cancel.';
    let answered = false;
    const done = (ids) => { if (answered) return; answered = true; t.send({ op: 'files', files: ids ?? [] }); w.delete(); };
    w.on('click', (ev) => { if (ev.icon?.name === 'cancel') done(null); });
    w.on('close', (ev) => { ev.preventDefault(); done(null); });
    w.on('key', (ev) => { if (ev.code === 27) { done(null); return true; } });
    w.on('dataload', (ev) => {
      const files = (ev.files ?? []).filter((f) => f.filetype !== 0x1000 && f.filetype !== 0x2000);
      if (!files.length) { task.reportError('Only files can be sent, not directories'); return true; }
      app.uploadFiles(e.multiple ? files : files.slice(0, 1), t.bw).then(done, (err) => { task.reportError(err.message); done(null); });
      return true;
    });
    w.open({ behind: 'top' });
    wimp.setCaret(w);
  }

  // downloads: a Save box straight away; the file comes when both it's fetched and a place is chosen
  const downloads = new Map();
  function downloadBox(t, e) {
    const conv = hostToRiscos(e.name, false) ?? { name: 'download', type: 0xFFD };
    let state = 'inProgress', saving = false, finish = null;
    const done = new Promise((resolve, reject) => { finish = { resolve, reject }; });
    const box = saveAs({
      task, title: 'Save download', filename: conv.name, filetype: conv.type ?? 0xFFD,
      getData: async () => { saving = true; await done; return app.engine.fetchFile(e.id); },
    });
    box.on('closed', () => setTimeout(() => {
      if (!saving) { app.engine.send({ op: 'download', id: e.id, action: 'cancel' }); downloads.delete(e.id); }
      box.delete();
    }, 0));
    const d = {
      progress(p) {
        state = p.state;
        const bw = t?.bw;
        if (p.state === 'inProgress') bw?.note_(`Fetching ${e.name}: ${p.total ? Math.round(p.received * 100 / p.total) + '%' : Math.round(p.received / 1024) + 'K'}`, 0);
        else {
          bw?.note_(p.state === 'completed' ? `${e.name} fetched` : `${e.name} wasn't fetched`);
          downloads.delete(e.id);
          if (p.state === 'completed') finish.resolve(); else finish.reject(new Error(`The download of ${e.name} was stopped`));
        }
      },
    };
    downloads.set(e.id, d);
    void state;
    box.openCentred();
  }

  // ---------------------------------------------------------------- save boxes
  const leafFrom = (t, fallback) => {
    const s = (t?.title || '').replace(/[^A-Za-z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
    return s || fallback;
  };
  app.saveMenu = (bw) => saveAs({
    task, title: 'Save as', filename: leafFrom(bw.current, 'Page'), filetype: 0xFAF,
    getData: async () => new TextEncoder().encode((await bw.current.request({ op: 'source' })).text),
  });
  app.saveLocation = (bw) => saveAs({
    task, title: 'Save as', filename: leafFrom(bw.current, 'URI'), filetype: 0xF91,
    getData: () => uriFile(bw.current.url, bw.current.title),
  });
  app.pdfBox = (bw) => saveAs({
    task, title: 'Save as', filename: leafFrom(bw.current, 'Page') + '/pdf', filetype: 0xADF,
    getData: async () => app.engine.fetchFile((await bw.current.request({ op: 'pdf' })).file),
  });

  // ---------------------------------------------------------------- hotlist and history lists ('hotlist' template)
  app.listWindow = (kind, bw) => {
    bw._lists ??= {};
    if (bw._lists[kind]) { bw._lists[kind].refresh(); return bw._lists[kind]; }
    const entries = () => (kind === 'history' ? app.history : app.hotlist);
    const w = bw._lists[kind] = task.createWindowFromTemplate(tpl, 'hotlist', { workButton: 'doubleclick', spriteArea: spr });
    (bw._extra ??= new Set()).add(w);
    w.setTitle(kind === 'history' ? 'History' : kind === 'del' ? 'Remove from hotlist' : 'Hotlist');
    const LH = 22;
    const size = () => w.setExtent({ x0: 0, y0: 0, x1: 750, y1: Math.max(LH * entries().length, 390) });
    size();
    w.refresh = () => { size(); w.invalidate(); };
    const css = fonts.cssFor('Homerton.Medium', 12);
    w.useCanvas((g, r) => {
      g.font = css;
      entries().forEach((e, i) => {
        const y = (i + 1) * LH;
        if (y < r.y0 || y - LH > r.y1) return;
        let x = 4;
        if (kind === 'del') { g.fillStyle = '#ff0000'; g.fillText('×', x, y - LH / 4 - 1); x += 12; }
        g.fillStyle = '#000000';
        g.fillText(e.title || e.url, x, y - LH / 4 - 1);
      });
    }, { hiDPI: true });
    w.helpText = kind === 'del' ? 'Double-click SELECT on a page to remove it from your hotlist.' : 'Double-click SELECT on a page to show it.|MDouble-click ADJUST to show it and keep this list open.';
    w.on('helprequest', (ev) => { const e = entries()[Math.floor(ev.y / LH)]; if (e) ev.text = e.url; });
    const pick = (ev) => {
      const i = Math.floor(ev.y / LH), list = entries();
      if (i < 0 || i >= list.length) return;
      if (kind === 'del') {
        app.hotlist.splice(i, 1); savePrefs(); refreshLists();
        for (const x of app.windows) x.setButtons();
        if (!app.hotlist.length) { wimp.menus.close(); w.close(); }
        return;
      }
      bw.go(list[i].url);
      if (ev.button !== 'adjust') { if (w._menuWindow) wimp.menus.close(); w.close(); }
    };
    w.on('doubleclick', (ev) => { if (ev.button !== 'menu') pick(ev); return true; });
    w.on('close', (ev) => { ev.preventDefault(); w.close(); });
    w.openAt = (ev) => {
      const W = 427, H = 396;
      const x = Math.max(0, Math.min(wimp.width - W - 30, (ev?.sx ?? input.mouseX) - 64)), y = Math.max(40, Math.min(wimp.height - H - 60, (ev?.sy ?? input.mouseY) - 40));
      w.open({ x, y, w: W, h: H, scrollX: 0, scrollY: 0, behind: 'top' });
    };
    return w;
  };

  // ---------------------------------------------------------------- Find ('find' template)
  app.findWindow = (bw) => {
    if (bw._find) return bw._find;
    const w = bw._find = task.createWindowFromTemplate(tpl, 'find', { spriteArea: spr });
    (bw._extra ??= new Set()).add(w);
    const I = w.icons;
    I[2].bufLen = 256;
    if (bw.lastFind) I[2].setText(bw.lastFind.text);
    I[6].setState({ selected: !!bw.lastFind?.caseSensitive });
    w.helpText = 'Type the text to look for in the page.';
    const done = () => { if (w._menuWindow) wimp.menus.close(); w.close(); };
    const find = async () => {
      const text = I[2].text, t = bw.current;
      if (!text || !t) return false;
      bw.lastFind = { text, caseSensitive: I[6].selected };
      let found = false;
      if (t instanceof PageTab) found = (await t.request({ op: 'find', text, caseSensitive: I[6].selected }).catch(() => ({}))).found;
      else { bw.note_('Finding text needs !Browse\'s engine: use your browser\'s own Find in embedded pages'); return false; }
      if (!found) { wimp.beep(); bw.note_(`'${text}' wasn't found`); }
      return found;
    };
    w.on('click', (ev) => {
      if (ev.button === 'menu') return;
      if (ev.iconIndex === 0) { find().then((ok) => { if (ok && ev.button === 'select') done(); }); return true; }
      if (ev.iconIndex === 5) { find(); return true; }
      if (ev.iconIndex === 1) { if (ev.button === 'select') done(); return true; }
    });
    w.on('key', (ev) => {
      if (ev.code === 13) { find().then((ok) => { if (ok) done(); }); return true; }
      if (ev.code === 27) { done(); return true; }
    });
    w.on('menuopen', () => wimp.setCaret(w, I[2], I[2].text.length));
    w.openAt = (ev) => {
      w.open({ x: Math.max(0, Math.min(wimp.width - w.w - 30, (ev?.sx ?? 200) - 64)), y: Math.max(40, (ev?.sy ?? 200) - 60), behind: 'top' });
      wimp.setCaret(w, I[2], I[2].text.length);
    };
    return w;
  };

  // ---------------------------------------------------------------- Choices
  let choicesWin = null;
  const choicesWindow = () => {
    if (choicesWin) return choicesWin;
    const w = choicesWin = task.createWindow({
      title: 'Browse choices', x: Math.round(wimp.width / 2 - 250), y: Math.round(wimp.height / 2 - 130), w: 500, h: 254, extent: { w: 500, h: 254 },
      flags: { title: true, moveable: true, close: true, back: true },
      icons: [
        { x: 12, y: 16, w: 100, h: 28, text: 'Home page', rjustify: true },
        { x: 120, y: 14, w: 368, h: 32, text: '', button: 'writable', border: true, filled: true, bg: 0, validation: 'R7', maxLen: 1024, name: 'home', help: 'The page the home button shows, and new windows start with.' },
        { x: 12, y: 56, w: 100, h: 28, text: 'Search with', rjustify: true },
        { x: 120, y: 54, w: 368, h: 32, text: '', button: 'writable', border: true, filled: true, bg: 0, validation: 'R7', maxLen: 1024, name: 'search', help: 'Words typed in the URL bar are looked up here: %s stands for the words.' },
        { x: 120, y: 98, w: 300, h: 28, text: 'Play sounds from pages', sprite: 'optoff', validation: 'Soptoff,opton', button: 'radio', esg: 0, name: 'sound', help: 'Pages\' sound plays on this computer (it needs !Browse\'s engine in Chrome for Testing or Chromium).' },
        { x: 120, y: 130, w: 300, h: 28, text: 'Always show the tab bar', sprite: 'optoff', validation: 'Soptoff,opton', button: 'radio', esg: 0, name: 'tabs', help: 'Show the tab bar even when there\'s only one page in a window.' },
        { x: 12, y: 176, w: 476, h: 2, border: true, validation: 'R4' },
        { x: 12, y: 200, w: 100, h: 40, text: 'Default', border: true, filled: true, hcentre: true, validation: 'R5,3', button: 'click', name: 'default', help: 'Click SELECT to fill in the standard choices.' },
        { x: 200, y: 200, w: 88, h: 40, text: 'Cancel', border: true, filled: true, hcentre: true, validation: 'R5,3', button: 'click', name: 'cancel', help: 'Click SELECT to close this without changing anything.' },
        { x: 296, y: 200, w: 88, h: 40, text: 'Set', border: true, filled: true, hcentre: true, validation: 'R5,3', button: 'click', name: 'set', help: 'Click SELECT to use these choices until you quit !Browse.' },
        { x: 392, y: 196, w: 96, h: 48, text: 'Save', border: true, filled: true, hcentre: true, validation: 'R6,3', button: 'click', name: 'save', help: 'Click SELECT to use these choices and keep them.' },
      ],
    });
    w.helpText = 'This is where you choose how !Browse works.';
    const I = (n) => w.iconByName(n);
    const fill = (p) => {
      I('home').setText(p.home); I('search').setText(p.search);
      I('sound').setState({ selected: !!p.sound }); I('tabs').setState({ selected: !!p.alwaysTabs });
    };
    const use = () => {
      prefs.home = I('home').text.trim() || DEFAULTS.home;
      prefs.search = I('search').text.includes('%s') ? I('search').text.trim() : DEFAULTS.search;
      prefs.alwaysTabs = I('tabs').selected;
      if (prefs.sound !== I('sound').selected) app.setSound(I('sound').selected);
      for (const x of app.windows) { x.drawTabs(); x.layout(); }
    };
    w.on('click', (ev) => {
      const n = ev.icon?.name;
      if (ev.button === 'menu' || !n) return;
      if (n === 'default') fill(DEFAULTS);
      else if (n === 'cancel') { fill(prefs); if (ev.button === 'select') w.close(); }
      else if (n === 'set' || n === 'save') { use(); if (n === 'save') savePrefs(true); if (ev.button === 'select') w.close(); }
      return true;
    });
    w.on('key', (ev) => {
      if (ev.code === 13) { use(); savePrefs(true); w.close(); return true; }
      if (ev.code === 27) { fill(prefs); w.close(); return true; }
    });
    w.fill = () => fill(prefs);
    return w;
  };

  // ---------------------------------------------------------------- icon bar
  const quit = () => { saveHistory(); for (const w of [...app.windows]) w.destroy(); app.engine?.close(); task.quit(); };
  const engineLine = () => app.engine ? `Engine: ${app.engine.engineName ?? probe.info.engine}${app.engine.hasAudio === false ? ' (no sound)' : ''}` : 'Embedded pages (no engine)';
  task.addIconbarIcon({
    sprite: '!browse', side: 'right',
    help: () => `This is the Browse icon.|MClick SELECT to open a browser window.|MClick MENU for other options.|MDrag a URI or URL file here to show its page.|M${engineLine()}.`,
    onClick: (ev) => { if (ev.button !== 'menu') app.newWindow(prefs.home); },
    menu: () => new Menu('Browse', [
      { text: 'Info', submenu: () => infoBox(task, { ...(ctx.app?.info ?? {}), purpose: `Web browser. ${engineLine()}` }) },
      { text: 'Choices...', action: () => { const w = choicesWindow(); w.fill(); if (!w.isOpen) w.open({ behind: 'top' }); else w.bringToFront(); } },
      { text: 'Quit', action: quit },
    ]),
    onDataLoad: (ev) => { openFiles(ev.files ?? [ev]); },
  });
  async function openFiles(files) {
    for (const f of files) {
      if (f.filetype !== 0xF91 && f.filetype !== 0xB28) continue;
      const url = await readURLFile(f.path).catch(() => null);
      if (url) app.newWindow(url);
    }
  }
  task.onMessage('DataOpen', (m) => {
    if (m.filetype !== 0xF91 && m.filetype !== 0xB28) return false;
    openFiles([m]);
    return true;
  });
  task.onMessage('Quit', () => { quit(); return true; });
  task.onMessage('PreQuit', () => { saveHistory(); return false; });
  task.on('quit', () => { saveHistory(); app.engine?.close(); });

  // *Run <Browse$Dir>.!Run -url <address> (Alias$URLOpen_http), or a URI / URL file
  const runArgs = (args, file) => {
    const m = /(?:^|\s)-url\s+("?)(\S+)\1/.exec(args ?? '');
    if (m) { app.newWindow(m[2]); return true; }
    if (file && vfs.exists(file)) { const st = vfs.stat(file); openFiles([{ path: st.path, filetype: st.filetype }]); return true; }
    return false;
  };
  // (running it again with a file: the file comes as DataOpen, above)
  task.on('run', ({ args }) => runArgs(args, null));

  task.browse = app;                 // for tests
  runArgs(ctx.args, ctx.file);
  return app;
}
