// !ARPlayer - the Acorn Replay movie player desktop front end (SJ Middleton / Uniqueway, 1.29
// 01-Jul-96), recreated from its C sources (BuildSys/ReplayFlop/Source/ARPlayer/Uniqueway/ARTools:
// main.c, display.c, tools.c, play.c, info.c, setup.c, global.c) with the original Templates,
// Messages and sprites.
//
// Display windows ("sprdisp") show the movie's helpful sprite (or !ARMovie's Default sprite) at its
// own size with the Tools pane (time bar + VCR buttons) hanging below. Sound tracks play multi-tasking
// through WebAudio (../Player/audio.js), as ARPlayer's own sound-only playback did. There are no
// video decompressors here, so movies with video play their sound track in the desktop and "Play
// big" shows the helpful sprite full screen while the sound plays.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { os } from '../../core/os.js';
import { loadMessages } from '../../core/messages.js';
import { loadTemplates, IF } from '../../core/templates.js';
import { loadManifest, spritesFromFile } from '../../core/sprites.js';
import { Voice } from '../Player/audio.js';
import { readHeader, movieLength, decodeTrack, helpfulSprite, trackData, trackCoding, parseInfoFile } from './armovie.js';

const TPL = 'assets/templates/ARPlayer.json';
const FT_ARMOVIE = 0xAE7, FT_SPRITE = 0xFF9, FT_TEXT = 0xFFF, FT_DATA = 0xFFD, FT_OBEY = 0xFEB, FT_DIR = 0x1000;
const ARMOVIE_VERSION = '0.37 (9th December 1994)';   // what <ARMovie$Dir>.Player sets (ARPlayer:Dummy -playfor 0)
const RATE_UNIT = 100;
const GRANULARITY = 40;                               // ms between time bar updates (4 cs alarm)

// Tools pane icons (tools.c)
const T = { stop: 1, play: 2, pause: 3, step: 4, mute: 5, timebar: 6, time: 8, big: 9 };
// Setup ("Controls") icons (setup.c)
const S = { ok: 0, cancel: 1, changeMode: 3, changeTo: 4, big: 26, useTraj: 7, trajName: 8, useShape: 11, shapeName: 9,
  loop: 12, loopFor: 13, loopForever: 16, track: 18, video: 21, useArgs: 27, useRate: 33, rate: 28, args: 31, trajMenu: 10, shapeMenu: 22 };
// field -> [up arrow, down arrow] in the Controls / info / global windows
const INC_ARROWS = { Controls: { 4: [5, 6], 13: [14, 15], 18: [19, 20], 28: [29, 30] }, info: { 22: [23, 24] }, global: { 7: [8, 9], 11: [12, 13] } };
// Movie info icons (info.c)
const I = { chunks: 7, movie: 8, date: 9, author: 10, audio: 16, videoType: 18, videoCopy: 14, size: 19, video: 20, track: 22, soundInfo: 26 };
// Global choices icons (global.c)
const G = { create: 16, cancel: 17, ok: 24, version: 15, interp: 4, col4: 5, usePref: 6, useBig: 10, pref: 7, big: 11 };
// xferdata option icons -> extract flags (display.c)
const EX = { images: 1, sound: 2, sprite: 4, keys: 8, header: 16 };
const EX_ICONS = { 5: EX.images, 6: EX.sound, 7: EX.sprite, 8: EX.keys, 9: EX.header };

/** C printf subset for the Messages formats (%d %s %g %02d %i). */
function fmt(s, ...a) {
  let i = 0;
  return String(s).replace(/%(0?)(\d*)([dsgi%])/g, (m, z, w, c) => {
    if (c === '%') return '%';
    let v = a[i++];
    if (c === 'd' || c === 'i') v = String(Math.trunc(Number(v) || 0));
    else if (c === 'g') v = String(+Number(v).toPrecision(6));
    else v = String(v ?? '');
    return w ? v.padStart(+w, z ? '0' : ' ') : v;
  });
}

export default async function start(task, ctx) {
  const vfs = os.vfs, sysvars = os.sysvars;
  const msgs = await loadMessages('ARPlayer');
  const M = (tok, ...a) => fmt(msgs.has(tok) ? msgs.dict[tok] : tok, ...a);
  const has = (tok) => msgs.has(tok);

  // ------------------------------------------------------------------ !Run checks and variables
  if (!sysvars.get('ARMovie$Dir')) {
    await task.reportError('ARMovie resources not found. Please open a directory display containing the !ARMovie application.');
    task.quit();
    return;
  }
  if (!sysvars.get('ARMovie$Version')) sysvars.set('ARMovie$Version', ARMOVIE_VERSION);
  const appDir = ctx.dir || sysvars.get('ARPlayer$Dir') || ctx.app.appDir;
  if (!sysvars.get('ARPlayer$OptionsFile')) sysvars.set('ARPlayer$OptionsFile', `${appDir}.!Choices`);
  if (!sysvars.get('ARPlayer$StateFile')) sysvars.set('ARPlayer$StateFile', sysvars.get('Choices$Write') ? `${sysvars.get('Choices$Write')}.Boot.PreDesk.ARPlayer` : `${appDir}.!State`);
  const armovieDir = () => sysvars.get('ARMovie$Dir');
  const soundDir = () => sysvars.get('ARMovie$SoundDir') || `${armovieDir()}.Sound16`;
  const exists = (p) => { try { return vfs.exists(p); } catch { return false; } };

  // ------------------------------------------------------------------ resources
  const tpl = await loadTemplates(TPL);
  // resspr_AddSprites("<ARMovie$Dir>.Sprites") then ARPlayer:Sprites
  const area = new Map([...await loadManifest('ARMovie', 'Sprites22'), ...await loadManifest('ARPlayer', 'Sprites22')]);
  // ARMovie default sprite (<ARMovie$Dir>.Default)
  let defaultSprite = null, defaultBytes = null;
  try {
    defaultBytes = await vfs.readFile(`${armovieDir()}.Default`);
    defaultSprite = [...spritesFromFile(defaultBytes).values()][0] ?? null;
  } catch { /* fall back to the converted copy */ }
  if (!defaultSprite) { defaultSprite = [...(await loadManifest('ARMovie', 'Default')).values()][0] ?? null; defaultBytes = null; }
  // sound decompressor Info files (<ARMovie$SoundDir>.<name>.Info)
  const infoCache = new Map();
  async function preloadInfo(bytes) {
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048)).split('\n')[9] ?? '';
    for (const m of head.matchAll(/(?:^|\|\s*\d+)\s*2\s+(\S+)/g)) {
      const name = m[1];
      if (infoCache.has(name)) continue;
      let info = null;
      try { const p = `${soundDir()}.${name}.Info`; if (exists(p)) info = parseInfoFile(await vfs.readText(p)); } catch { /* none */ }
      infoCache.set(name, info);
    }
  }
  const readInfo = (name) => infoCache.get(name) ?? null;

  // ------------------------------------------------------------------ options (main.c) + choices file
  const options = {
    displayOpen: false, catchDataOpen: true, timebar: true, toolbar: true, sound: true, multipleWindows: false, windowButtons: true,
    play: newPlay(),
    interp: [100000000, 100000000],
  };
  function newPlay() {
    return { changeMode: false, trajectory: false, loop: false, loopForever: false, video: true, big: false, shape: false, extraArgs: false, rateAdjust: false,
      mode: '13', trajectoryFile: '', shapeFile: '', loopFor: 1, soundtrack: 1, extraArgsText: '', rate: RATE_UNIT };
  }
  const copyPlay = (p) => ({ ...p });
  const OPT_FLAGS = [['DisplayOpen', options, 'displayOpen'], ['CatchDataOpen', options, 'catchDataOpen'], ['Timebar', options, 'timebar'],
    ['Toolbar', options, 'toolbar'], ['Sound', options, 'sound'], ['MultipleWindows', options, 'multipleWindows'], ['WindowButtons', options, 'windowButtons']];
  const PLAY_FLAGS = [['ChangeMode', 'changeMode'], ['PlayTrajectory', 'trajectory'], ['Loop', 'loop'], ['LoopForever', 'loopForever'], ['PlayVideo', 'video'],
    ['PlayBig', 'big'], ['PlayShape', 'shape'], ['UseExtraArgs', 'extraArgs'], ['UseRateAdjust', 'rateAdjust']];
  const PLAY_VALUES = [['Screen mode', 'mode'], ['Loop for', 'loopFor', true], ['Rate change', 'rate', true], ['Trajectory', 'trajectoryFile'], ['Shape', 'shapeFile'], ['Extra args', 'extraArgsText']];
  const yes = (v) => (v ? 'Yes' : 'No');
  async function preferencesLoad() {
    const f = sysvars.get('ARPlayer$OptionsFile');
    if (!exists(f)) return;
    let text;
    try { text = await vfs.readText(f); } catch { return; }
    const kv = new Map();
    for (const line of text.split(/\r?\n/)) { const m = /^\s*([^#|:][^:]*?)\s*:\s*(.*?)\s*$/.exec(line); if (m) kv.set(m[1].toLowerCase(), m[2]); }
    const flag = (k) => (kv.has(k.toLowerCase()) ? /^(y|yes|on|true|1)$/i.test(kv.get(k.toLowerCase())) : undefined);
    for (const [k, o, p] of OPT_FLAGS) { const v = flag(k); if (v !== undefined) o[p] = v; }
    for (const [k, p] of PLAY_FLAGS) { const v = flag(k); if (v !== undefined) options.play[p] = v; }
    for (const [k, p, num] of PLAY_VALUES) if (kv.has(k.toLowerCase())) options.play[p] = num ? (parseInt(kv.get(k.toLowerCase()), 10) || options.play[p]) : kv.get(k.toLowerCase());
    if (kv.has('interpolation')) { const n = kv.get('interpolation').split(',').map((x) => parseInt(x, 10)); if (n.length === 2 && n.every(Number.isFinite)) options.interp = n; }
    if (options.play.trajectoryFile && !findFile(`${armovieDir()}.Trajectory`, options.play.trajectoryFile)) { options.play.trajectoryFile = ''; options.play.trajectory = false; }
    if (options.play.shapeFile && !findFile(`${armovieDir()}.Shapes`, options.play.shapeFile)) { options.play.shapeFile = ''; options.play.shape = false; }
  }
  function preferencesSave() {
    const f = sysvars.get('ARPlayer$OptionsFile');
    const out = ['# ARPlayer options', ''];
    for (const [k, o, p] of OPT_FLAGS) out.push(`${k}: ${yes(o[p])}`);
    for (const [k, p] of PLAY_FLAGS) out.push(`${k}: ${yes(options.play[p])}`);
    for (const [k, p] of PLAY_VALUES) out.push(`${k}: ${options.play[p] ?? ''}`);
    out.push(`Interpolation: ${options.interp.join(',')}`, '');
    try { vfs.writeFile(f, out.join('\n'), { filetype: FT_TEXT }); } catch (e) { task.reportError(e.message); }
  }
  // check_file(): a leaf in the ARMovie directory or a full pathname
  function findFile(root, file) {
    if (!file) return null;
    if (exists(`${root}.${file}`)) return `${root}.${file}`;
    if (/[.:$]/.test(file) && exists(file)) return file;
    return null;
  }
  await preferencesLoad();

  // ------------------------------------------------------------------ help helpers
  const winHelp = (w, prefix, whole) => {
    w.on('helprequest', (ev) => {
      const i = ev.icon ? w.icons.indexOf(ev.icon) : -1;
      if (i >= 0) {
        const ic = w.icons[i];
        if (ic.selected && has(`${prefix}${i}S`)) { ev.text = M(`${prefix}${i}S`); return; }
        if (has(`${prefix}${i}`)) { ev.text = M(`${prefix}${i}`); return; }
      }
      ev.text = M(whole ?? prefix);
    });
  };
  const menuHelp = (tok, { ticked, shaded } = {}) => () => {
    if (shaded?.() && has(tok + 'G')) return M(tok + 'G');
    if (ticked?.() && has(tok + 'S')) return M(tok + 'S');
    return has(tok) ? M(tok) : null;
  };
  const menuItems = (tok) => M(tok).split(',').map((s) => s.replace(/^>/, ''));

  // ------------------------------------------------------------------ writable number fields with arrows (dboxinc)
  function numberField(w, key, field, inc, get = null, set = null) {
    const ic = w.icons[field];
    const arrows = INC_ARROWS[key]?.[field] ?? [];
    const read = () => (get ? get(ic.text) : parseInt(ic.text, 10) || 0);
    const write = (v) => ic.setText(set ? set(v) : String(v));
    return {
      field, inc, arrows,
      get: () => Math.max(inc.min, Math.min(inc.max, read())),
      set: (v) => write(Math.max(inc.min, Math.min(inc.max, v))),
      step(up, big) { const v = Math.max(inc.min, Math.min(inc.max, read() + (up ? 1 : -1) * (big && inc.big ? inc.big : inc.step))); write(v); inc.notify?.(v); },
      fade(f) { ic.setState({ shaded: f }); for (const a of arrows) w.icons[a].setState({ shaded: f }); },
    };
  }
  /** Handle a click on an arrow of one of the fields; returns true if it was one. */
  function processInc(w, fields, ev) {
    for (const f of fields) {
      const [up, down] = f.arrows;
      if (ev.iconIndex !== up && ev.iconIndex !== down) continue;
      if (w.icons[ev.iconIndex].shaded) return true;
      const isUp = (ev.iconIndex === up) !== (ev.button === 'adjust');
      f.step(isUp, ev.shift);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ sprite helpers
  const spriteImage = (info) => (info ? info.canvas() : Promise.resolve(null));

  // ------------------------------------------------------------------ sound (one playback at a time, like ARLib)
  const voice = new Voice();
  let playing = null;             // the display whose sound is loaded in the voice
  voice.onend = () => { const dp = playing; if (dp) soundEnded(dp); };

  // ------------------------------------------------------------------ displays
  const displays = [];
  let displayBase = null;
  let openContext = 0;
  let clipboardLocal = false;

  function newDisplay() {
    return {
      win: null, tools: null, filename: null, hdr: null, bytes: null, nsoundtracks: 0, length: 0, nframes: 0,
      sprite: null, spriteBytes: null, grabbedFrame: -1,
      timebarOpen: options.timebar, toolsOpen: options.toolbar, soundOn: options.sound,
      play: { ...copyPlay(options.play), soundtrack: 1 },
      currentFrame: 0, displayedFrame: -1, timeMode: 'decimal', state: 'stopped',
      info: null, infoTrack: 1, snd: new Map(), loopsLeft: 0, pendingPauseAt: -1, stepTo: -1,
    };
  }

  /** scan_file(): read the header, work out the length. Returns false if not a usable movie. */
  async function scanFile(dp, filename) {
    dp.hdr = null; dp.bytes = null; dp.snd = new Map(); dp.nsoundtracks = 0;
    dp.filename = filename;
    let bytes;
    try { bytes = await vfs.readFile(filename); } catch (e) { task.reportError(e.message); dp.filename = null; return false; }
    await preloadInfo(bytes);
    const hdr = readHeader(bytes, readInfo);
    if (!hdr) { task.reportError('Not a movie file.'); dp.filename = null; return false; }
    if (hdr.videoFormat === 0 && !hdr.sound.length) { dp.filename = null; return false; }
    const { length, nframes } = movieLength(hdr);
    Object.assign(dp, { hdr, bytes, length, nframes, nsoundtracks: hdr.nsoundtracks });
    hdr.nframes = nframes;
    return true;
  }

  /** display__loadsprite(): the helpful sprite, else the ARMovie default sprite. */
  function loadSprite(dp) {
    let ok = false;
    if (dp.filename && dp.hdr) {
      const b = helpfulSprite(dp.bytes, dp.hdr);
      try {
        const spr = b ? [...spritesFromFile(b).values()][0] : null;
        if (spr) { dp.sprite = spr; dp.spriteBytes = b; ok = true; }
      } catch { /* corrupt */ }
      if (!ok) task.reportError(M('disp4'), { category: 'warning' });
    }
    if (!ok) { dp.sprite = defaultSprite; dp.spriteBytes = defaultBytes; }
    dp.grabbedFrame = -1;
    return !!dp.sprite;
  }

  /** sprdisplay_update(): size the window's work area to the sprite and redraw. */
  function showSprite(dp) {
    const s = dp.sprite;
    const w = s ? s.cssW : 160, h = s ? s.cssH : 128;
    const win = dp.win;
    const top = win.y;
    win.setExtent({ w, h });
    win.open({ x: win.x, y: top, w, h, behind: 'keep' });
    spriteImage(s).then(() => win.invalidate());
    syncPane(dp);
  }

  function setTitle(dp) {
    dp.win.setTitle(dp.hdr?.name ? dp.hdr.name : dp.filename ? dp.filename : M('disp1'));
  }

  /** display__open() */
  async function openDisplay(filename) {
    const dp = newDisplay();
    if (filename) await scanFile(dp, filename);
    loadSprite(dp);
    const win = task.createWindowFromTemplate(tpl, 'sprdisp', { spriteArea: area });
    dp.win = win;
    win.useCanvas((g) => {
      g.imageSmoothingEnabled = false;
      const s = dp.sprite;
      if (s?._canvas) g.drawImage(s._canvas, 0, 0, s.cssW, s.cssH);
      else { g.fillStyle = '#000'; g.fillRect(0, 0, win.extent.x1, win.extent.y1); }
    });
    win.on('click', (ev) => {
      if (ev.button === 'menu') { wimp.menus.openAt(displayMenu(dp), ev, { task }); return true; }
      if (ev.button === 'select') { if (options.windowButtons || !dp.toolsOpen) playStart(dp, false); return true; }
      if (ev.button === 'adjust') { if (options.windowButtons || !dp.toolsOpen) playStop(dp); return true; }
      return true;
    });
    win.on('close', (ev) => {
      ev.preventDefault?.();
      // wmisc_CheckClose: Adjust opens the parent directory, Shift-Adjust keeps the window
      if (ev.button === 'adjust' && dp.filename) os.filer.openDir(vfs.parent(dp.filename));
      if (!(ev.button === 'adjust' && ev.shift)) disposeDisplay(dp);
      return false;
    });
    win.on('dataload', (ev) => {
      const f = ev.files?.[0];
      if (f?.filetype === FT_ARMOVIE) { loadFile(dp, f.path); return true; }
      return false;
    });
    win.on('helprequest', (ev) => { ev.text = M('dhelp'); });
    createTools(dp);
    setTitle(dp);
    displays.push(dp);
    if (!displayBase) displayBase = dp;
    // wmisc_openshifted(): each new window a title bar lower, back to the start near the bottom
    const titleH = 20;
    const s = dp.sprite;
    win.setExtent({ w: s?.cssW ?? 160, h: s?.cssH ?? 128 });
    win.w = s?.cssW ?? 160; win.h = s?.cssH ?? 128;
    const shift = openContext * (titleH + 2);
    if (win.y + win.h + shift > wimp.height - 64) openContext = 1;
    else { win.y += shift; openContext++; }
    win.open({ behind: 'top' });
    spriteImage(dp.sprite).then(() => win.invalidate());
    syncPane(dp);
    if (checkOnScreen(dp)) openContext = 0;
    return dp;
  }

  /** display_checkonscreen(): keep the window and its pane clear of the icon bar. */
  function checkOnScreen(dp) {
    const win = dp.win;
    const top = win.y - 20;                                  // outline including the title bar
    let bottom = win.y + win.h + 1;
    if (dp.tools?.isOpen) bottom = Math.max(bottom, dp.tools.y + dp.tools.h + 1);
    const overhang = bottom - (wimp.height - 64);             // 128 OS units above the bottom
    const clearance = top;
    let moveby = 0;
    if (clearance < 0) moveby = clearance;
    else if (overhang > 0) moveby = Math.min(overhang, clearance);
    if (moveby) { win.open({ y: win.y - moveby }); syncPane(dp); }
    return moveby;
  }

  function disposeDisplay(dp) {
    if (dp.state !== 'stopped' || playing === dp) stopSound(dp);
    if (setupFor === dp) closeSetup();
    if (dp.info) { dp.info.delete(); dp.info = null; }
    dp.tools?.delete();
    dp.win.delete();
    const i = displays.indexOf(dp);
    if (i >= 0) displays.splice(i, 1);
    if (dp === displayBase) displayBase = null;
  }

  /** display_loadfile() */
  async function loadFile(dp, name) {
    if (name) {
      if (dp.state !== 'stopped') playStop(dp);
      dp.currentFrame = 0;
      await scanFile(dp, name);
      if (dp.play.soundtrack > dp.nsoundtracks) dp.play.soundtrack = 1;
      if (dp.infoTrack > dp.nsoundtracks) dp.infoTrack = 1;
      loadSprite(dp);
      showSprite(dp);
      setTitle(dp);
      refreshTime(dp);
      if (setupFor === dp) refreshSetup(dp);
      if (dp.info) setInfoFields(dp);
    }
    dp.win.open({ behind: 'top' });
    syncPane(dp);
  }

  /** display_open(): a new window, or the existing one if Multiple windows is off. */
  async function displayOpen(filename) {
    if (options.multipleWindows || !displayBase) return openDisplay(filename);
    await loadFile(displayBase, filename);
    return displayBase;
  }
  async function displayRunFile(name) { const dp = await displayOpen(name); playStart(dp, false); }

  // ------------------------------------------------------------------ tools pane (tools.c)
  function createTools(dp) {
    const tools = task.createWindowFromTemplate(tpl, 'Tools', { spriteArea: area });
    dp.tools = tools;
    tools._paneParent = dp.win;       // keep it directly in front of the display (Wimp pane stacking)
    const TI = tools.icons;
    // the time bar reports drags as well as clicks
    TI[T.timebar].flags = ((TI[T.timebar].flags & ~0xF000) | (6 << 12)) >>> 0;
    // time bar fill: inside the icon less 12 OS units each side, red then white
    const b = TI[T.timebar].bbox;
    const bar = document.createElement('div');
    bar.style.cssText = `position:absolute;left:${b.x0 + 6}px;top:${b.y0 + 6}px;width:${b.x1 - b.x0 - 12}px;height:${b.y1 - b.y0 - 12}px;background:#fff;pointer-events:none;overflow:hidden`;
    const red = document.createElement('div');
    red.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:0;background:#f00';
    bar.appendChild(red);
    tools.work.appendChild(bar);
    dp.bar = { el: bar, red, w: b.x1 - b.x0 - 12 };
    tools.on('click', (ev) => {
      if (ev.button === 'menu') { wimp.menus.openAt(displayMenu(dp), ev, { task }); return true; }
      switch (ev.iconIndex) {
        case T.stop: playStop(dp); TI[T.stop].setState({ selected: false }); break;
        case T.play: if (ev.button !== 'menu') playStart(dp, false); refreshPlay(dp); break;
        case T.big: if (!TI[T.big].shaded) playStart(dp, true); break;
        case T.pause: playPause(dp); break;
        case T.step: playStep(dp, ev.button === 'adjust' ? -1 : 1); TI[T.step].setState({ selected: false }); break;
        case T.mute: toggleMute(dp); break;
        case T.timebar: if (dp.state === 'stopped' && ev.button === 'select') setFrameAt(dp, ev.sx); break;
        default: break;
      }
      return true;
    });
    tools.on('drag', (ev) => {
      if (ev.iconIndex !== T.timebar || dp.state !== 'stopped' || ev.button !== 'select') return;
      wimp.drag({ type: 'point', event: ev.pointerEvent, onMove: (q) => setFrameAt(dp, q.sx) });
      return true;
    });
    winHelp(tools, 'HTools');
    for (const e of ['opened', 'moved']) dp.win.on(e, () => syncPane(dp));
    dp.win.on('closed', () => tools.close());
    refreshSound(dp);
    dp.displayedFrame = -1;
    refreshTime(dp);
    refreshPlay(dp);
  }

  /** Open the pane below the display, cropped to the time bar and/or the buttons. */
  function syncPane(dp) {
    const tools = dp.tools;
    if (!tools) return;
    if (!dp.win.isOpen || (!dp.timebarOpen && !dp.toolsOpen)) { if (tools.isOpen) tools.close(); return; }
    const full = 58, frameTop = 28;                       // icon 0 (button frame) top = -56 OS units
    let scrollY = 0, h = full;
    if (!dp.timebarOpen) { scrollY = frameTop + 4; h = full - scrollY; }
    else if (!dp.toolsOpen) h = frameTop;
    tools.open({ x: dp.win.x, y: dp.win.y + dp.win.h + 2, w: 320, h, scrollX: 81, scrollY, behind: 'keep' });
    wimp._stackAbove?.(tools, dp.win);
  }

  function setFrameAt(dp, sx) {
    if (!dp.hdr) return;
    const x0 = dp.tools.workToScreen(dp.tools.icons[T.timebar].bbox.x0 + 6, 0).x;
    const f = Math.round(((sx - x0) * dp.nframes) / dp.bar.w);
    const v = Math.max(0, Math.min(dp.nframes, f));
    if (v !== dp.currentFrame) { dp.currentFrame = v; refreshTime(dp); }
  }

  function refreshSound(dp) { dp.tools?.icons[T.mute].setState({ selected: dp.soundOn }); }
  function refreshPause(dp) { dp.tools?.icons[T.pause].setState({ selected: dp.state === 'paused' }); }
  function refreshPlay(dp) {
    if (!dp.tools) return;
    dp.tools.icons[T.play].setState({ selected: dp.state !== 'stopped' });
    dp.tools.icons[T.big].setState({ shaded: dp.state !== 'stopped' });
  }
  function clearStop(dp) { dp.tools?.icons[T.stop].setState({ selected: false }); dp.tools?.icons[T.step].setState({ selected: false }); }
  function timeMode(dp, mode) {
    dp.timeMode = mode;
    dp.tools?.icons[T.time].setState({ shaded: mode === 'faded' });
    if (mode !== 'faded') setTime(dp, true);
  }
  function setTime(dp, force) {
    let nsecs = 0, nfr = 0;
    if (dp.hdr) { nsecs = Math.trunc(dp.currentFrame / dp.hdr.fps); nfr = Math.trunc(dp.currentFrame - nsecs * dp.hdr.fps); }
    const p2 = (n) => String(n).padStart(2, '0');
    if (dp.timeMode === 'decimal') {
      if (force || dp.displayedFrame !== dp.currentFrame) { dp.tools?.icons[T.time].setText(`${p2(Math.trunc(nsecs / 60))}:${p2(nsecs % 60)}.${p2(nfr)}`); dp.displayedFrame = dp.currentFrame; }
    } else if (force || dp.displayedFrame !== nsecs) {
      dp.tools?.icons[T.time].setText(`${p2(Math.trunc(nsecs / 60))}:${p2(nsecs % 60)}`);
      dp.displayedFrame = nsecs;
    }
  }
  function refreshTime(dp) {
    if (!dp.tools || dp.timeMode === 'faded') return;
    const w = dp.hdr && dp.nframes ? Math.floor((dp.bar.w * dp.currentFrame) / dp.nframes) : 0;
    dp.bar.red.style.width = Math.max(0, Math.min(dp.bar.w, w)) + 'px';
    setTime(dp, false);
  }
  function toggleBars(dp) { syncPane(dp); checkOnScreen(dp); }

  // ------------------------------------------------------------------ playback (play.c)
  const readPlay = (dp) => { const p = copyPlay(dp.play); if (setupWin?.isOpen && setupFor === dp) getSetupFields(p); return p; };
  const frameTime = (dp, frame) => frame / dp.hdr.fps;          // seconds

  function soundFor(dp, track) {
    if (!dp.snd.has(track)) dp.snd.set(track, decodeTrack(dp.bytes, dp.hdr, track));
    return dp.snd.get(track);
  }

  function stopSound(dp) {
    if (playing === dp) { voice.stop(); playing = null; }
  }

  /** play_movie() for sound playback (ARLib armovie_playsound). */
  function playMovie(dp, play, step, big) {
    const hdr = dp.hdr;
    if (dp.currentFrame >= dp.nframes) { dp.currentFrame = 0; refreshTime(dp); }
    const sp = hdr.sound[0];
    if (step && !(sp?.seekable)) { task.reportError(M('play2')); dp.state = 'stopped'; finish(); return; }
    if (!dp.nsoundtracks || play.soundtrack > dp.nsoundtracks) {
      if (dp.nsoundtracks) task.reportError(M('play0', play.soundtrack));
      dp.state = 'stopped'; finish(); return;
    }
    const snd = soundFor(dp, play.soundtrack);
    if (!snd) { task.reportError(M('play1', `sound type ${hdr.sound[play.soundtrack - 1]?.filename || '?'} not supported`)); dp.state = 'stopped'; finish(); return; }
    // another display's sound stops (one sound player)
    if (playing && playing !== dp) { const o = playing; voice.stop(); playing = null; soundEnded(o, true); }
    voice.load(snd);
    playing = dp;
    const loop = !step && play.loop;
    voice.setLoop(loop && play.loopForever);
    dp.loopsLeft = loop && !play.loopForever ? Math.max(0, play.loopFor - 1) : 0;
    voice.setMute(!dp.soundOn);
    const t = frameTime(dp, dp.currentFrame);
    if (step) {
      dp.stepTo = dp.currentFrame + 1;
      voice.play(t);
    } else if (dp.state === 'paused') {
      voice.seek(t); voice.paused = true;
      timeMode(dp, 'seconds');
    } else {
      voice.play(t);
      timeMode(dp, 'seconds');
    }
    if (big) bigScreen(dp);
    finish();
    function finish() { refreshTime(dp); refreshPlay(dp); refreshPause(dp); clearStop(dp); }
  }

  /** play_events(): the sound finished (or was stopped by another playback). */
  function soundEnded(dp, aborted = false) {
    if (!aborted && dp.loopsLeft > 0 && playing === dp) { dp.loopsLeft--; voice.play(0); return; }
    if (!aborted) dp.currentFrame = dp.stepTo >= 0 ? dp.stepTo : dp.nframes;
    dp.stepTo = -1;
    dp.pendingPauseAt = -1;
    if (playing === dp && !aborted) playing = null;
    dp.state = 'stopped';
    releaseBig();
    refreshPlay(dp); refreshPause(dp); timeMode(dp, 'decimal'); refreshTime(dp);
  }

  /** play_alarm(): follow the sound position. */
  task.every(GRANULARITY, () => {
    const dp = playing;
    if (!dp || !dp.hdr) return;
    if (!voice.playing && !voice.paused) return;
    const t = voice.position;
    dp.currentFrame = Math.min(dp.nframes, Math.trunc(t * dp.hdr.fps + 0.5));
    if (dp.stepTo >= 0 && dp.currentFrame >= dp.stepTo) { voice.stop(); playing = null; soundEnded(dp, false); return; }
    refreshTime(dp);
    if (dp.pendingPauseAt !== -1 && dp.currentFrame >= dp.pendingPauseAt) { voice.pause(); dp.pendingPauseAt = -1; }
  });

  function playStop(dp) {
    if (dp.state === 'stopped') {
      if (playing === dp) { voice.stop(); playing = null; dp.stepTo = -1; }
      dp.currentFrame = 0;
      loadSprite(dp);
      dp.win.invalidate();
      refreshTime(dp);
    } else {
      stopSound(dp);
      dp.pendingPauseAt = -1;
      dp.state = 'stopped';
      releaseBig();
      refreshPlay(dp); refreshPause(dp); timeMode(dp, 'decimal'); refreshTime(dp);
    }
    clearStop(dp);
  }

  function playStart(dp, big) {
    if (!dp || !dp.filename || dp.state !== 'stopped') return;
    if (!dp.hdr.videoFormat && big) return;               // play big needs video
    const play = readPlay(dp);
    dp.state = 'playing';
    playMovie(dp, play, false, big);
  }

  function playPause(dp) {
    if (!dp.filename) { refreshPause(dp); return; }
    switch (dp.state) {
      case 'stopped': {
        const play = readPlay(dp);
        dp.state = 'paused';
        refreshPause(dp); refreshPlay(dp);
        playMovie(dp, play, false, false);
        break;
      }
      case 'playing':
        dp.state = 'paused';
        if (playing === dp) voice.pause();
        refreshPause(dp);
        break;
      case 'paused':
        dp.state = 'playing';
        dp.pendingPauseAt = -1;
        if (playing === dp) voice.resume();
        refreshPause(dp);
        break;
      default: break;
    }
  }

  function playStep(dp) {
    if (!dp.filename) return;
    switch (dp.state) {
      case 'stopped': playMovie(dp, readPlay(dp), true, false); break;
      case 'playing':
        dp.state = 'paused';
        if (playing === dp) voice.pause();
        refreshPause(dp);
        break;
      case 'paused':
        if (dp.pendingPauseAt !== -1) dp.pendingPauseAt++;
        else {
          dp.pendingPauseAt = dp.currentFrame + 1 >= dp.nframes ? 1 : dp.currentFrame + 1;
          if (playing === dp) voice.resume();
        }
        break;
      default: break;
    }
  }

  function toggleMute(dp) {
    dp.soundOn = !dp.soundOn;
    options.sound = dp.soundOn;
    refreshSound(dp);
    if (dp.state !== 'stopped' && playing === dp) voice.setMute(!dp.soundOn);
  }

  // "Play big": the helpful sprite full screen while the sound plays (no video decompressors here)
  let big = null;
  function bigScreen(dp) {
    releaseBig();
    const scr = os.cli.acquireScreen({ onKey: (e) => { if (e.key === 'Escape') playStop(dp); } });
    const c = document.createElement('canvas');
    const s = dp.sprite;
    const k = Math.max(1, Math.floor(Math.min(scr.width / (s?.cssW || 1), scr.height / (s?.cssH || 1))));
    c.width = (s?.cssW ?? 0) * k; c.height = (s?.cssH ?? 0) * k;
    c.style.cssText = `position:absolute;left:${(scr.width - c.width) >> 1}px;top:${(scr.height - c.height) >> 1}px;image-rendering:pixelated`;
    spriteImage(s).then((img) => { if (!img) return; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, c.width, c.height); });
    scr.el.appendChild(c);
    scr.el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (e.button === 0) playPause(dp); else playStop(dp); });
    scr.el.addEventListener('contextmenu', (e) => e.preventDefault());
    big = scr;
  }
  function releaseBig() { if (big) { big.release(); big = null; } }

  // ------------------------------------------------------------------ Movie info (info.c)
  function channelsString(sp) {
    if (sp.channels === 1) return M('mono');
    if (sp.channels === 2) return M(sp.reversed ? 'stereor' : 'stereo');
    return M('nchans', sp.channels);
  }
  function setAudioFields(dp) {
    const w = dp.info, hdr = dp.hdr;
    if (hdr && hdr.sound.length) {
      const sp = hdr.sound[dp.infoTrack - 1] ?? hdr.sound[0];
      if (sp.format) w.icons[I.soundInfo].setText(M('Minfo2', sp.format, channelsString(sp), sp.rate, sp.rate < 256 ? 'µs' : 'Hz'));
      else w.icons[I.soundInfo].setText('');
      if (sp.format === 1) w.icons[I.audio].setText(M('Minfo3', sp.precision, M(sp.filename)));
      else if (sp.format === 2) w.icons[I.audio].setText(infoCache.get(sp.filename)?.description ?? '');
      else w.icons[I.audio].setText('');
    } else {
      w.icons[I.audio].setText(M('none'));
      w.icons[I.soundInfo].setText('');
    }
    w.icons[I.track].setText(String(dp.infoTrack));
  }
  function setInfoFields(dp) {
    const w = dp.info, hdr = dp.hdr;
    w.setTitle(dp.filename ?? M('Tinfo'));
    w.icons[I.movie].setText(hdr?.name ?? '');
    w.icons[I.date].setText(hdr?.date ?? '');
    w.icons[I.author].setText(hdr?.author ?? '');
    if (hdr && hdr.videoFormat) {
      const vi = videoInfo(hdr.videoFormat);
      w.icons[I.videoType].setText(`Type ${hdr.videoFormat}: ${vi.description}`);
      w.icons[I.videoCopy].setText(vi.author);
      w.icons[I.size].setText(`${hdr.xsize}x${hdr.ysize}`);
      w.icons[I.video].setText(`${hdr.bpp}bpp ${hdr.colourspace} ${+hdr.fps.toPrecision(6)}Hz, ${hdr.keyFrameOffset > 0 ? M('Minfo0') : M('Minfo1')}`);
    } else {
      w.icons[I.videoType].setText(M('none'));
      for (const i of [I.videoCopy, I.size, I.video]) w.icons[i].setText('');
    }
    dp.infoInc.inc.max = dp.nsoundtracks || 1;
    setAudioFields(dp);
    w.icons[I.chunks].setText(hdr ? fmt('%d chunks x %d fpc = %g s', hdr.nchunks, hdr.framesPerChunk, dp.length / 100) : M('none'));
    w.icons[0].setState({ shaded: !hdr });
  }
  const videoInfoCache = new Map();
  function videoInfo(n) {
    if (!videoInfoCache.has(n)) {
      let v = { description: '', author: '' };
      const p = `${armovieDir()}.Decomp${n}.Info`;
      if (exists(p)) vfs.readText(p).then((t) => { const l = t.split(/\r?\n/); v.description = l[0] ?? ''; v.author = l[1] ?? ''; for (const dp of displays) if (dp.info && dp.hdr?.videoFormat === n) setInfoFields(dp); }).catch(() => {});
      videoInfoCache.set(n, v);
    }
    return videoInfoCache.get(n);
  }
  function infoOpen(dp) {
    if (dp.info) { dp.info.bringToFront(); return; }
    const w = task.createWindowFromTemplate(tpl, 'info', { spriteArea: area });
    dp.info = w;
    dp.infoInc = numberField(w, 'info', I.track, { step: 1, big: 0, min: 1, max: 100, notify: (v) => { dp.infoTrack = v; setAudioFields(dp); } });
    setInfoFields(dp);
    w.on('click', (ev) => { if (ev.button !== 'menu') processInc(w, [dp.infoInc], ev); return true; });
    w.on('key', (ev) => {
      if (ev.code === 13 && ev.icon === w.icons[I.track]) { const v = dp.infoInc.get(); dp.infoInc.set(v); dp.infoTrack = v; setAudioFields(dp); return true; }
      return false;
    });
    w.on('close', () => { w.delete(); dp.info = null; });
    winHelp(w, 'Hinfo');
    w.open({ behind: 'top' });
  }

  // ------------------------------------------------------------------ Movie setup (setup.c)
  let setupWin = null, setupFor = null, setupInc = null;
  const trajDir = () => `${armovieDir()}.Trajectory`, shapeDir = () => `${armovieDir()}.Shapes`;
  const fileMenu = (dir, title) => {
    if (!exists(dir)) return null;
    const items = [];
    for (const e of vfs.list(dir)) {
      if (e.isApp) continue;
      if (e.type === 'dir') items.push({ text: e.name, submenu: new Menu(e.name, vfs.list(e.path).filter((x) => !x.isApp).map((x) => ({ text: x.name, action: () => setupSetName(dir, x.name) }))) });
      else items.push({ text: e.name, action: () => setupSetName(dir, e.name) });
    }
    return items.length ? new Menu(title, items) : null;
  };
  function setupSetName(dir, leaf) {
    const field = dir === trajDir() ? S.trajName : S.shapeName;
    setupWin?.icons[field].setText(leaf);
  }
  function ensureSetup() {
    if (setupWin) return setupWin;
    const w = task.createWindowFromTemplate(tpl, 'Controls', { spriteArea: area });
    setupWin = w;
    const rate = (s) => Math.trunc(parseFloat(s) * RATE_UNIT + 0.5) || 0;
    setupInc = {
      change: numberField(w, 'Controls', S.changeTo, { step: 1, big: 10, min: 0, max: 127 }),
      rate: numberField(w, 'Controls', S.rate, { step: 1, big: 10, min: 1, max: 10 * RATE_UNIT }, rate, (v) => String(+(v / RATE_UNIT).toPrecision(6))),
      loop: numberField(w, 'Controls', S.loopFor, { step: 1, big: 10, min: 1, max: 1000 }),
      track: numberField(w, 'Controls', S.track, { step: 1, big: 0, min: 1, max: 100 }),
    };
    w.on('click', (ev) => {
      const I2 = w.icons, i = ev.iconIndex;
      if (ev.button === 'menu') {
        if (i === S.trajName || i === S.shapeName) popupMenu(i === S.trajName ? 'traj' : 'shap', ev);
        return true;
      }
      if (i >= 0 && I2[i]?.shaded) return true;
      switch (i) {
        case S.ok:
          if (setupFor) { getSetupFields(setupFor.play); Object.assign(options.play, copyPlay(setupFor.play)); setupUpdate(setupFor); }
          if (ev.button === 'adjust') refreshSetup(setupFor); else closeSetup();
          break;
        case S.cancel:
          if (ev.button === 'adjust') { if (setupFor) setSetupFields(setupFor.play); refreshSetup(setupFor); } else closeSetup();
          break;
        case S.changeMode: fadeMode(); break;
        case S.useTraj: fadeTraj(); break;
        case S.useShape: fadeShape(); break;
        case S.useRate: fadeRate(); break;
        case S.loop: case S.loopForever: fadeLoop(); break;
        case S.useArgs: fadeArgs(); break;
        case S.video: fadeMode(); fadeTraj(); fadeShape(); fadeArgs(); fadeRate(); break;
        case S.trajMenu: popupMenu('traj', ev); break;
        case S.shapeMenu: popupMenu('shap', ev); break;
        default: processInc(w, Object.values(setupInc), ev); break;
      }
      return true;
    });
    w.on('dataload', (ev) => {
      const f = ev.files?.[0];
      const i = ev.icon ? w.icons.indexOf(ev.icon) : -1;
      if (f && (f.filetype === FT_DATA || f.filetype === FT_TEXT) && (i === S.shapeName || i === S.trajName)) { w.icons[i].setText(f.path); return true; }
      return false;
    });
    winHelp(w, 'HControls');
    return w;
  }
  function popupMenu(which, ev) {
    const m = which === 'traj' ? fileMenu(trajDir(), M('Ttraj')) : fileMenu(shapeDir(), M('Tshap'));
    if (!m) return;
    const field = which === 'traj' ? S.trajName : S.shapeName;
    if (setupWin.icons[field].shaded) return;
    wimp.menus.openAt(m, ev, { task });
  }
  const sel = (i) => !!setupWin.icons[i].selected;
  const selSet = (i, v) => setupWin.icons[i].setState({ selected: !!v });
  const fadeIcon = (i, f) => setupWin.icons[i].setState({ shaded: !!f });
  const noVideo = () => !setupHasVideo || !sel(S.video);
  let setupHasVideo = 0, setupTracks = 0;
  function fadeMode() { const f = noVideo(); fadeIcon(S.changeMode, f); setupInc.change.fade(f || !sel(S.changeMode)); }
  function fadeTraj() { const f = noVideo(); fadeIcon(S.useTraj, f); const g = f || !sel(S.useTraj); fadeIcon(S.trajName, g); fadeIcon(S.trajMenu, g || !fileMenu(trajDir(), '')); }
  function fadeShape() { const f = noVideo(); fadeIcon(S.useShape, f); const g = f || !sel(S.useShape); fadeIcon(S.shapeName, g); fadeIcon(S.shapeMenu, g || !fileMenu(shapeDir(), '')); }
  function fadeLoop() { const f = !sel(S.loop); fadeIcon(S.loopForever, f); setupInc.loop.fade(f || sel(S.loopForever)); }
  function fadeSound() { setupInc.track.fade(setupTracks === 0); }
  function fadeVideo() { fadeIcon(S.video, !setupHasVideo); }
  function fadeRate() { const f = noVideo(); fadeIcon(S.useRate, f); setupInc.rate.fade(f || !sel(S.useRate)); }
  function fadeArgs() { const f = noVideo(); fadeIcon(S.useArgs, f); fadeIcon(S.args, f || !sel(S.useArgs)); }
  function setSetupFields(t) {
    selSet(S.changeMode, t.changeMode); selSet(S.big, t.big); selSet(S.useTraj, t.trajectory); selSet(S.useShape, t.shape);
    selSet(S.loop, t.loop); selSet(S.loopForever, t.loopForever); selSet(S.video, t.video); selSet(S.useArgs, t.extraArgs); selSet(S.useRate, t.rateAdjust);
    const I2 = setupWin.icons;
    I2[S.changeTo].setText(t.mode); I2[S.trajName].setText(t.trajectoryFile ?? ''); I2[S.shapeName].setText(t.shapeFile ?? '');
    setupInc.rate.set(t.rate); I2[S.loopFor].setText(String(t.loopFor)); I2[S.track].setText(String(t.soundtrack)); I2[S.args].setText(t.extraArgsText ?? '');
  }
  function getSetupFields(t) {
    Object.assign(t, {
      changeMode: sel(S.changeMode), big: sel(S.big), trajectory: sel(S.useTraj), shape: sel(S.useShape), loop: sel(S.loop), loopForever: sel(S.loopForever),
      video: sel(S.video), rateAdjust: sel(S.useRate), extraArgs: sel(S.useArgs),
      mode: setupWin.icons[S.changeTo].text, trajectoryFile: setupWin.icons[S.trajName].text, shapeFile: setupWin.icons[S.shapeName].text,
      extraArgsText: setupWin.icons[S.args].text,
      loopFor: setupInc.loop.get(), soundtrack: setupInc.track.get(), rate: setupInc.rate.get(),
    });
    return t;
  }
  function refreshSetup(dp) {
    if (!setupWin || !dp) return;
    setupFor = dp;
    setupTracks = dp.nsoundtracks;
    setupInc.track.inc.max = dp.nsoundtracks || 1;
    setupHasVideo = dp.hdr ? dp.hdr.videoFormat : 0;
    setupWin.icons[S.track].setText(String(dp.play.soundtrack));
    fadeMode(); fadeTraj(); fadeShape(); fadeLoop(); fadeSound(); fadeArgs(); fadeRate(); fadeVideo();
  }
  function setupPopup(dp) {
    const w = ensureSetup();
    if (w.isOpen) w.bringToFront(); else w.open({ behind: 'top' });
    if (dp !== setupFor) { setSetupFields(dp.play); refreshSetup(dp); }
  }
  function closeSetup() { if (setupWin) { setupWin.close(); setupFor = null; } }
  /** play_updatefn(): the setup changed while playing - restart with the new options. */
  function setupUpdate(dp) {
    if (dp.state === 'playing' && playing === dp) { playStop(dp); playStart(dp, false); }
  }

  // ------------------------------------------------------------------ Global choices (global.c)
  let globalWin = null, globalInc = null;
  const global = { interp: false, col4: false, usePref: false, useBig: false, prefMode: '', bigMode: '', r1: -1, r2: -1 };
  const modeString = () => `X${wimp.width},Y${wimp.height},C256,EX1,EY1`;
  function readVars(gp) {
    gp.col4 = sysvars.get('ARMovie$4Colour') != null;
    const s = sysvars.get('ARMovie$Interpolate');
    gp.interp = false;
    if (s) {
      gp.interp = true;
      if (s.length > 1) { const [a, b] = s.split(','); gp.r1 = parseInt(a, 10) || 0; gp.r2 = b != null ? parseInt(b, 10) || 0 : 0; } else gp.r1 = gp.r2 = -1;
    }
    const pm = sysvars.get('ARMovie$PrefMode');
    gp.usePref = pm != null;
    if (pm != null) gp.prefMode = pm; else if (!gp.prefMode) gp.prefMode = modeString();
    const bm = sysvars.get('ARMovie$PrefBigMode');
    gp.useBig = bm != null;
    if (bm != null) gp.bigMode = bm; else if (!gp.bigMode) gp.bigMode = modeString();
  }
  const setenv = (v, val) => { if (val == null) sysvars.unset(v); else sysvars.set(v, val); };
  function globalSetFields(gp) {
    const w = globalWin;
    w.icons[G.version].setText(sysvars.get('ARMovie$Version') ?? '');
    w.icons[G.interp].setState({ selected: gp.interp });
    w.icons[G.col4].setState({ selected: gp.col4 });
    w.icons[G.usePref].setState({ selected: gp.usePref });
    w.icons[G.pref].setText(gp.prefMode);
    globalInc.pref.fade(!gp.usePref);
    w.icons[G.useBig].setState({ selected: gp.useBig });
    w.icons[G.big].setText(gp.bigMode);
    globalInc.big.fade(!gp.useBig);
  }
  function setPrefMode() { const on = globalWin.icons[G.usePref].selected; setenv('ARMovie$PrefMode', on ? globalWin.icons[G.pref].text : null); globalInc.pref.fade(!on); }
  function setPrefBigMode() { const on = globalWin.icons[G.useBig].selected; setenv('ARMovie$PrefBigMode', on ? globalWin.icons[G.big].text : null); globalInc.big.fade(!on); }
  function setInterpolate(r1, r2) {
    if (globalWin.icons[G.interp].selected) setenv('ARMovie$Interpolate', r1 === -1 ? '.' : `${r1},${r2}`);
    else setenv('ARMovie$Interpolate', null);
  }
  function setSwitch() { setenv('ARMovie$4Colour', globalWin.icons[G.col4].selected ? '.' : null); }
  function globalReadOptions() { if (globalWin?.isOpen) { setPrefMode(); setPrefBigMode(); } }
  function globalPopup() {
    if (globalWin?.isOpen) { globalWin.bringToFront(); return; }
    if (!globalWin) {
      const w = task.createWindowFromTemplate(tpl, 'global', { spriteArea: area });
      globalWin = w;
      const notify = (v) => (n) => setenv(v, String(n));
      globalInc = {
        pref: numberField(w, 'global', G.pref, { step: 1, big: 10, min: 0, max: 127, notify: notify('ARMovie$PrefMode') }),
        big: numberField(w, 'global', G.big, { step: 1, big: 10, min: 0, max: 127, notify: notify('ARMovie$PrefBigMode') }),
      };
      w.on('click', async (ev) => {
        if (ev.button === 'menu') return true;
        const i = ev.iconIndex;
        if (i >= 0 && w.icons[i]?.shaded) return true;
        switch (i) {
          case G.interp: setInterpolate(options.interp[0], options.interp[1]); break;
          case G.col4: setSwitch(); break;
          case G.usePref: setPrefMode(); break;
          case G.useBig: setPrefBigMode(); break;
          case G.create: globalReadOptions(); await createTables(); break;
          case G.ok:
            globalReadOptions();
            if (ev.button === 'adjust') readVars(global); else w.close();
            break;
          case G.cancel:
            globalSetFields(global);
            globalReadOptions();
            setInterpolate(global.r1, global.r2);
            setSwitch();
            if (ev.button !== 'adjust') w.close();
            break;
          default: processInc(w, Object.values(globalInc), ev); break;
        }
        return true;
      });
      w.on('key', (ev) => {
        if (ev.code !== 13) return false;
        if (ev.icon === w.icons[G.pref]) { setPrefMode(); return true; }
        if (ev.icon === w.icons[G.big]) { setPrefBigMode(); return true; }
        return false;
      });
      winHelp(w, 'Hglobal');
    }
    readVars(global);
    globalSetFields(global);
    globalWin.open({ behind: 'top' });
  }
  async function createTables() {
    const bpp = 8;                                         // the desktop runs in a 256 colour mode
    if (bpp !== 4 && bpp !== 8) { task.reportError(M('glob0', bpp)); return; }
    const r = await task.reportError(M('glob1'), { category: 'question', okText: M('create'), cancel: true, cancelText: M('cancel') });
    if (r !== 1) return;
    try { await os.cli.run(`Run ${armovieDir()}.MovingLine.Make${bpp}col11`); } catch (e) { task.reportError(e.message); }
  }
  function saveBootOptions() {
    globalReadOptions();
    const f = sysvars.get('ARPlayer$StateFile');
    let s = '| Setup ARMovie configuration variables\n';
    for (const v of ['ARMovie$PrefMode', 'ARMovie$PrefBigMode', 'ARMovie$Interpolate', 'ARMovie$4Colour']) {
      const val = sysvars.get(v);
      if (val != null) s += `Set ${v} ${val}\n`;
    }
    try {
      const parent = vfs.parent(f);
      if (parent && !exists(parent)) vfs.mkdir(parent, { parents: true });
      vfs.writeFile(f, s, { filetype: FT_OBEY });
    } catch (e) { task.reportError(e.message); }
  }

  // ------------------------------------------------------------------ Save frame / Save data boxes (saveas)
  function saveBox(name, { leaf, filetype, sprite, save, toApp, extra }) {
    const w = task.createWindowFromTemplate(tpl, name, { spriteArea: area });
    const I2 = w.icons;
    I2[4].setState({ deleted: true });                    // "Selection" (not used by ARPlayer)
    const ic = I2[3];
    ic.flags = ((ic.flags | IF.sprite) & ~IF.text) >>> 0;
    ic.setSprite(sprite);
    I2[2].setText(leaf);
    const leafOf = (p) => { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i + 1) : p; };
    const doSave = async (path) => {
      try { if ((await save(path)) !== false) { I2[2].setText(path); wimp.menus.close(); w.close(); } } catch (e) { task.reportError(e.message ?? String(e)); }
    };
    const ok = () => {
      const t = I2[2].text;
      if (!/[.:]/.test(t)) { task.reportError('To save, drag the icon to a directory display'); return; }
      doSave(t);
    };
    w.on('click', (ev) => {
      if (ev.button === 'menu') return true;
      if (ev.iconIndex === 0) ok();
      else if (ev.iconIndex === 1) { wimp.menus.close(); w.close(); }
      else extra?.click?.(ev);
      return true;
    });
    w.on('drag', (ev) => {
      if (ev.iconIndex !== 3) return;
      const b = ic.bbox, p = w.workToScreen(b.x0, b.y0);
      const s = os.sprites.get(sprite);
      const sw = s?.cssW ?? 34, sh = s?.cssH ?? 34;
      const sx = p.x + ((b.x1 - b.x0) - sw) / 2, sy = p.y + ((b.y1 - b.y0) - sh) / 2;
      wimp.drag({ sprite, box: { x0: sx, y0: sy, x1: sx + sw, y1: sy + sh }, event: ev.pointerEvent }).then(async (drop) => {
        if (!drop?.window || drop.window === w) return;
        const dir = drop.window._filerDir;
        if (dir) doSave(`${dir}.${leafOf(I2[2].text)}`);
        else if (toApp) { const r = await toApp(drop, leafOf(I2[2].text)); if (r) { wimp.menus.close(); w.close(); } }
      });
      return true;
    });
    w.on('key', (ev) => {
      if (ev.code === 13) { ok(); return true; }
      if (ev.code === 27) { wimp.menus.close(); w.close(); return true; }
      return false;
    });
    winHelp(w, `H${name}`);
    return w;
  }
  const spriteFileOf = (dp) => dp.spriteBytes;
  function saveFrameBox(dp) {
    const leaf = dp.grabbedFrame === -1 ? M('disp2') : M('disp0', dp.grabbedFrame);
    return saveBox('xfersend', {
      leaf, filetype: FT_SPRITE, sprite: 'file_ff9',
      save: (path) => { vfs.writeFile(path, spriteFileOf(dp), { filetype: FT_SPRITE }); },
      toApp: async (drop, leafname) => {
        const res = await wimp.dataSave(drop, { leafname, filetype: FT_SPRITE, size: spriteFileOf(dp)?.length ?? 0, getData: async () => spriteFileOf(dp) }, task);
        if (res?.path) vfs.writeFile(res.path, spriteFileOf(dp), { filetype: FT_SPRITE });
        return !!res;
      },
    });
  }
  let extractFlags = EX.sound | EX.sprite | EX.header;
  let extractDestination = null;
  function saveDataBox(dp) {
    let w;
    const setOpts = () => {
      const avail = { 5: !!dp.hdr?.videoFormat, 6: dp.nsoundtracks > 0, 7: true, 8: (dp.hdr?.keyFrameOffset ?? 0) > 0, 9: true };
      for (const [i, bit] of Object.entries(EX_ICONS)) w.icons[i].setState({ selected: !!(extractFlags & bit), shaded: !avail[i] });
    };
    w = saveBox('xferdata', {
      leaf: extractDestination ?? M('disp3'), filetype: FT_DIR, sprite: 'directory',
      save: (dir) => extractTo(dp, dir),
      extra: { click: (ev) => { const bit = EX_ICONS[ev.iconIndex]; if (bit && !w.icons[ev.iconIndex].shaded) extractFlags = w.icons[ev.iconIndex].selected ? extractFlags | bit : extractFlags & ~bit; } },
    });
    setOpts();
    return w;
  }
  /** What "<ARMovie$Dir>.Tools.Extract -source .. -dest .. [-keys] [-header] [-sprite] [-images] [-sound 1 2 ..]" writes. */
  async function extractTo(dp, dir) {
    const { hdr, bytes } = dp;
    if (!exists(dir)) vfs.mkdir(dir, { parents: true });
    if (extractFlags & EX.header) vfs.writeFile(`${dir}.Header`, hdr.lines.join('\n') + '\n', { filetype: FT_TEXT });
    if (extractFlags & EX.sprite) { const s = helpfulSprite(bytes, hdr); if (s) vfs.writeFile(`${dir}.Sprite`, s, { filetype: FT_SPRITE }); }
    if (extractFlags & EX.sound && dp.nsoundtracks) {
      const count = {};
      for (let n = 1; n <= dp.nsoundtracks; n++) {
        const sp = hdr.sound[n - 1];
        const { type, bits } = trackCoding(sp);
        const base = type === 'adpcm' ? 'Adpcm' : bits === 16 ? 'Samples' : 'Sound';
        count[base] = (count[base] ?? 0) + 1;
        vfs.writeFile(`${dir}.${base}${count[base] > 1 ? count[base] : ''}`, trackData(bytes, hdr, n), { filetype: FT_DATA });
      }
    }
    if (extractFlags & EX.images && hdr.videoFormat) {
      hdr.catalogue.forEach((c, i) => {
        const d = `${dir}.Images${Math.floor(i / 100)}`;
        if (!exists(d)) vfs.mkdir(d);
        vfs.writeFile(`${d}.${String(i % 100).padStart(2, '0')}`, bytes.subarray(c.offset, c.offset + c.video), { filetype: FT_DATA });
      });
    }
    if (extractFlags & EX.keys && hdr.keyFrameOffset > 0 && hdr.videoFormat) {
      const size = hdr.xsize * hdr.ysize * hdr.bpp / 8;
      for (let i = 0; i < hdr.nchunks - 1; i++) {
        const d = `${dir}.Keys${Math.floor(i / 100)}`;
        if (!exists(d)) vfs.mkdir(d);
        const o = hdr.keyFrameOffset + i * size;
        if (o + size <= bytes.length) vfs.writeFile(`${d}.${String(i % 100).padStart(2, '0')}`, bytes.subarray(o, o + size), { filetype: FT_DATA });
      }
    }
    extractDestination = dir;
    return true;
  }

  // ------------------------------------------------------------------ menus
  const progInfo = task.createWindowFromTemplate(tpl, 'progInfo', { spriteArea: area });
  progInfo.icons[4].setText(ctx.app.info.version);
  winHelp(progInfo, 'HprogInfo', 'HprogInfo');

  const im = menuItems('imenu');
  const iconMenu = new Menu('ARPlayer', [
    { text: im[0], submenu: progInfo, help: menuHelp('IHELP0') },
    { text: im[1], ticked: () => !!globalWin?.isOpen, action: () => globalPopup(), help: menuHelp('IHELP1') },
    { text: im[2], ticked: () => options.multipleWindows, action: () => { options.multipleWindows = !options.multipleWindows; }, help: menuHelp('IHELP2', { ticked: () => options.multipleWindows }) },
    { text: im[3], action: () => { saveBootOptions(); preferencesSave(); }, help: menuHelp('IHELP3') },
    { text: im[4], action: () => task.quit(), help: menuHelp('IHELP4') },
  ]);

  function displayMenu(dp) {
    const d0 = menuItems('dmenu0'), d1 = menuItems('dmenu1'), d2 = menuItems('dmenu2');
    const noSprite = () => !dp.sprite, noHdr = () => !dp.hdr;
    const fm = new Menu(M('dmenu1t'), [
      { text: d1[0], ticked: () => !!dp.info, action: () => infoOpen(dp), help: menuHelp('DHELP00') },
      { text: d1[1], shaded: noSprite, submenu: () => saveFrameBox(dp), help: menuHelp('DHELP01', { shaded: noSprite }) },
      { text: d1[2], shaded: noHdr, submenu: () => saveDataBox(dp), help: menuHelp('DHELP02', { shaded: noHdr }) },
    ]);
    const em = new Menu(M('dmenu2t'), [
      { text: d2[0], shaded: noSprite, action: () => { if (dp.spriteBytes) clipboardLocal = true; }, help: menuHelp('DHELP10', { shaded: noSprite }) },
      { text: d2[1], shaded: () => !clipboardLocal, action: () => { clipboardLocal = false; }, help: menuHelp('DHELP11', { shaded: () => !clipboardLocal }) },
    ]);
    return new Menu(M('dmenu0t'), [
      { text: d0[0], submenu: fm, help: menuHelp('DHELP0') },
      { text: d0[1], submenu: em, help: menuHelp('DHELP1') },
      { text: d0[2], ticked: () => !!setupWin?.isOpen, action: () => setupPopup(dp), help: menuHelp('DHELP2') },
      { text: d0[3], ticked: () => dp.timebarOpen, action: () => { dp.timebarOpen = !dp.timebarOpen; options.timebar = dp.timebarOpen; toggleBars(dp); }, help: menuHelp('DHELP3', { ticked: () => dp.timebarOpen }) },
      { text: d0[4], ticked: () => dp.toolsOpen, action: () => { dp.toolsOpen = !dp.toolsOpen; options.toolbar = dp.toolsOpen; toggleBars(dp); }, help: menuHelp('DHELP4', { ticked: () => dp.toolsOpen }) },
      { text: d0[5], action: () => playStart(dp, false), help: menuHelp('DHELP5') },
    ]);
  }

  // ------------------------------------------------------------------ icon bar, messages
  task.addIconbarIcon({
    sprite: '!arplayer',
    onClick: (ev) => { if (ev.button === 'select' || ev.button === 'adjust') displayOpen(null); },
    menu: iconMenu,
    onDataLoad: (ev) => { const f = ev.files?.[0]; if (f?.filetype === FT_ARMOVIE) displayOpen(f.path); },
    help: M('ICON'),
  });
  task.onMessage('DataOpen', (msg) => {
    if (msg.filetype !== FT_ARMOVIE || !options.catchDataOpen) return false;
    displayRunFile(msg.path);
    return true;
  });
  task.onMessage('Quit', () => task.quit());
  task.on('quit', () => { voice.stop(); releaseBig(); });

  // test hook
  task.arplayer = { displays, options, voice, get playing() { return playing; }, displayOpen, displayRunFile, playStart, playStop, playPause, playStep, infoOpen, setupPopup, globalPopup, iconMenu, displayMenu, progInfo };

  if (ctx.file && exists(ctx.file)) await displayRunFile(ctx.file);
  else if (options.displayOpen) await displayOpen(null);
}
