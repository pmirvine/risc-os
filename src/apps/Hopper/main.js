// !Hopper - the desktop side of Simon Foster's game (main.c, iconbar.c, menu.c, templates.c, keys.c, data.c and the
// QTM glue of qtm.c; BSD licence, RISC OS Open Apps/Diversions/Hopper 1.05). The game itself is game.js.
//
//  * Everything is loaded from the application directory as the C program does (data_load): Messages, Keys (the
//    internal key number -> name table), Templates (the original binary file: proginfo, prefs and its four panes,
//    change), Levels.Cars / Levels.Water, the pre-shifted MODE 13 graphics in Graphics.*, the log sound samples in
//    Sounds.* and the three ProTracker modules in Music.*. Choices come from Choices:Hopper.Choices (13 words) and
//    the high scores from Choices:Hopper.HiScores (10 x score word + 40 byte name), written to
//    <Choices$Write>.Hopper like the original ("Save" in Choices; the table is saved when Hopper quits if
//    "Save on exit" is on).
//  * The icon bar icon: Select or Adjust starts the game (hopper_go) full screen; Menu gives Info, Choices..., Quit.
//  * Choices: the prefs window with one of its four panes (Control keys, Sound & music, Miscellaneous, Advanced)
//    kept joined to it, the Set / Save / Cancel buttons (Adjust leaves the window open), the "Change" key reading
//    (the change box in the middle of the screen, then UP, DOWN, LEFT, RIGHT; function keys and mouse buttons are
//    not accepted, and each key must differ from the ones before), the volume sliders, option and radio icons.
//  * Sound: qtm.js is a stand-in for the QTMTracker module on the emulated sound system (8 channels, 1-4 music,
//    5-8 effects), called as qtm.c calls QTM.

import { wimp } from '../../core/wimp.js';
import { vfs } from '../../core/vfs.js';
import { os } from '../../core/os.js';
import { Menu } from '../../core/menu.js';
import { input } from '../../core/input.js';
import { parseTemplateFile } from '../../core/templates.js';
import { parseMessagesText } from '../../core/messages.js';
import { INTERNAL } from '../../basic/keymap.js';
import { Hopper, W, H, SONG } from './game.js';
import { QTM, parseMod } from './qtm.js';
import { PREF_ORDER, defaultPrefs, resetHi, readPrefs, writePrefs, readHi, writeHi } from './prefs.js';

// templates.h icon numbers
const PREFS = { CANCEL: 0, OK: 1, SAVE: 2, KEYS: 4, SOUND: 5, MISC: 6, ADV: 8 };
const KEYSW = { UP: 0, DOWN: 2, LEFT: 4, RIGHT: 6, CHANGE: 8 };
const MISC = { SAVE: 2, RESET: 3, AUTO: 6 };
const ADV = { VHIGH: 2, HIGH: 3, MEDIUM: 4, LOW: 5, NORMAL: 8, SLOWER: 9 };
const SOUND = { SOUND: 0, INGAME: 1, INTRO: 2, MUSIC_VOLUME: 5, FX_VOLUME: 8, FX_BACK: 11, MUSIC_BACK: 12 };
const CHANGE_STRING = 2;
const PANE_OF = { [PREFS.KEYS]: 'keys', [PREFS.SOUND]: 'sound', [PREFS.MISC]: 'misc', [PREFS.ADV]: 'advanced' };
// the keys_read_key exclusions: mouse buttons 9-11, F1-F9 (113-119, 20, 22), F10-F12 (28-30)
const NOT_ALLOWED = (k) => (k >= 9 && k <= 11) || (k >= 113 && k <= 119) || (k >= 28 && k <= 30) || k === 20 || k === 22;

/** DOM KeyboardEvent.code values for a RISC OS internal key number. */
const DOM_OF = new Map();
for (const [code, n] of Object.entries(INTERNAL)) { if (!DOM_OF.has(n)) DOM_OF.set(n, []); DOM_OF.get(n).push(code); }
DOM_OF.set(0, ['ShiftLeft', 'ShiftRight']); DOM_OF.set(1, ['ControlLeft', 'ControlRight']); DOM_OF.set(2, ['AltLeft', 'AltRight']);
const INTERNAL_OF = (e) => INTERNAL[e.code];

export default async function start(task, ctx) {
  const dir = ctx.dir || ctx.app.appDir;
  const read = async (leaf) => {
    try { return await vfs.readFile(dir + '.' + leaf); } catch { throw new Error(`Could not load file '${dir}.${leaf}'`); }   // BadLoad
  };
  const M = parseMessagesText(await vfs.readText(dir + '.Messages'));
  const msg = (t, a = '') => (M[t] ?? t).replace(/%0/g, a);
  const tpl = parseTemplateFile(await read('Templates'));

  // keys_initialise: the Keys lookup, one line per internal key number
  const lookup = (await vfs.readText(dir + '.Keys')).split('\n').slice(0, 128).map((l) => l.replace(/\r$/, ''));
  const keyName = (k) => (lookup[k - 128] ? lookup[k - 128] : msg('Unknown'));

  // Choices
  const choicesRead = (leaf) => {
    try { const c = vfs.canonical(`Choices:Hopper.${leaf}`); return c && vfs.exists(c) ? vfs.readFile(c) : null; } catch { return null; }
  };
  const choicesWrite = (leaf, data) => {
    try {
      const w = os.sysvars?.gstrans?.('<Choices$Write>') || '';
      const base = (w && !w.startsWith('<') ? w : 'ADFS::HardDisc4.$.!Boot.Choices') + '.Hopper';
      vfs.mkdir(base, { parents: true });
      vfs.writeFile(base + '.' + leaf, data, { filetype: 0xFFD });
    } catch (e) { console.warn('Hopper: cannot write choices', e); }
  };
  const prefsBytes = await choicesRead('Choices');
  const keys = prefsBytes ? readPrefs(prefsBytes) : defaultPrefs();
  const hiBytes = await choicesRead('HiScores');
  let hi = hiBytes ? readHi(hiBytes) : resetHi();

  // gfx_load_graphics_data, cars_load_data, water_load_data, qtm_load
  const G = {};
  for (const [k, f] of [['frog', 'Frog'], ['fly', 'Fly'], ['waters', 'Water'], ['vehicles', 'Vehicles'], ['scenery', 'Scenery'],
    ['snake', 'Snake'], ['numbers', 'Numbers'], ['title', 'Title']]) G[k] = await read('Graphics.' + f);
  const words = (b) => { const v = new DataView(b.buffer, b.byteOffset, b.byteLength); return Int32Array.from({ length: b.length >> 2 }, (_, i) => v.getInt32(i * 4, true)); };
  const cars = words(await read('Levels.Cars')), water = words(await read('Levels.Water'));
  const SAMPLE_FILES = ['Jump', 'Alarm', 'Frog', 'Splash', 'Clear', 'Burp', 'Splat', 'Bank', 'Eaten'];   // qtm.h order
  const samples = [];
  for (const s of SAMPLE_FILES) samples.push(await read('Sounds.' + s));
  const songs = { [SONG.INTRO]: parseMod(await read('Music.Intro')), [SONG.INGAME]: parseMod(await read('Music.InGame')), [SONG.HISCORE]: parseMod(await read('Music.HiScore')) };

  // ------------------------------------------------------------------ qtm.c
  const qtm = new QTM();
  let qtmWhich = SONG.NONE, chan = 5, last = 0;
  const Q = {
    start(which) {
      if (which === SONG.INTRO && keys.intro === 1) { qtm.load(songs[which]); qtmWhich = which; }
      else if (which === SONG.INGAME && keys.ingame === 1) { qtm.load(songs[which]); qtmWhich = which; }
      else if (which === SONG.HISCORE && keys.intro === 1) { qtm.load(songs[which]); qtmWhich = which; }
      qtm.volume = 64;                                // QTM_Load: the song at full volume
      qtm.musicVol = keys.musicVol;                   // QTM_MusicVolume
      qtm.sampleVol = keys.fxVol;                     // QTM_SampleVolume
      if (qtmWhich !== SONG.NONE) qtm.start();
    },
    stop() { qtm.stop(); qtmWhich = SONG.NONE; },    // qtm_stop_music (QTM_Stop, QTM_Clear)
    stopMusic() { this.stop(); },
    volume(v) { qtm.volume = v; },                    // QTM_Volume
    sample(n, note, vol, pos) {
      if (keys.soundFx !== 1) return;
      if (n === 0) chan = 4;                          // qtm_JUMP
      if (last === 0) qtm.playRawSample(5, new Uint8Array(1), 1, 64);   // QTM_PlaySample 5,0,1,64
      chan = chan === 8 ? 5 : chan + 1;
      qtm.stereo(chan, -126 + Math.trunc((pos * 100) / 126));
      qtm.playRawSample(chan, samples[n], note, vol);
      last = n;
    },
  };

  // ------------------------------------------------------------------ the game
  let game = null, playing = false, screenHandle = null;
  const keyBuffer = [];
  const env = {
    gfx: G, cars, water, keys, keyName, msg,
    get hi() { return hi; },
    qtm: Q,
    isDown: (n) => (DOM_OF.get(n) ?? []).some((c) => input.isDown(c)),
    readKey: () => keyBuffer.shift() ?? null,
    flushKeys: () => { keyBuffer.length = 0; },
    alive: () => task.alive && playing,
  };

  async function go() {
    if (playing) return;
    playing = true;
    wimp.menus?.close();
    game ??= new Hopper(env);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.className = 'hopper-screen';
    const scr = screenHandle = os.cli.acquireScreen({
      background: '#000',
      onKey: (e, k) => { if (k && k.code < 256) keyBuffer.push({ code: k.code, char: k.char }); },
    });
    scr.el.style.cursor = 'none';
    scr.el.addEventListener('contextmenu', (e) => e.preventDefault());
    const k = Math.min(scr.width / W, scr.height / H);
    canvas.style.cssText = `position:absolute;left:${Math.round((scr.width - W * k) / 2)}px;top:${Math.round((scr.height - H * k) / 2)}px;` +
      `width:${Math.round(W * k)}px;height:${Math.round(H * k)}px;image-rendering:pixelated`;
    scr.el.appendChild(canvas);
    game.attach(canvas);
    keyBuffer.length = 0;
    qtm.claim();
    task.hopper.running = true;
    try { await game.go(); }
    catch (e) { console.error(e); }
    finally {
      qtm.stop(); qtm.release();
      qtmWhich = SONG.NONE;
      scr.release();
      screenHandle = null;
      playing = false;
      task.hopper.running = false;
    }
  }

  // ------------------------------------------------------------------ windows (templates_initialise)
  const win = (name) => wimp.createWindowFromTemplate(tpl, name, {}, task);
  const proginfo = win('proginfo');
  proginfo.icons[3].setText(msg('_Version', '') === '_Version' ? '1.05 (23 Dec 2014)' : msg('_Version'));
  const prefs = win('prefs');
  const panes = { keys: win('keys'), sound: win('sound'), misc: win('misc'), advanced: win('advanced') };
  const change = win('change');
  // the change box's two frog icons name "!hopper95" (the application's earlier name), which isn't in !Sprites
  for (const i of [3, 4]) { const ic = change.icons[i]; if (/^!hopper95$/i.test(ic?.spriteName ?? ic?.sprite ?? '')) ic.setSprite('!hopper'); }

  let selected = PREFS.KEYS, temp = null;
  const paneWin = () => panes[PANE_OF[selected]];
  // keys_keep_joined: the pane stays where the templates put it relative to the prefs window
  const tp = tpl.windows.prefs.visible, tk = tpl.windows.keys.visible;
  const off = { dx: (tk.x0 - tp.x0) / 2, dy: (tp.y1 - tk.y1) / 2, w: (tk.x1 - tk.x0) / 2, h: (tk.y1 - tk.y0) / 2 };
  const joinPane = () => {
    const p = paneWin();
    for (const w of Object.values(panes)) if (w !== p && w.isOpen) w.close();
    if (!prefs.isOpen) { p.close(); return; }
    p.open({ x: prefs.x + off.dx, y: prefs.y + off.dy, w: off.w, h: off.h, behind: 'keep' });
    wimp._stackAbove?.(p, prefs);
  };
  prefs.on('opened', joinPane);
  prefs.on('moved', joinPane);
  prefs.on('closed', () => Object.values(panes).forEach((w) => w.isOpen && w.close()));
  prefs.on('close', (ev) => { ev.preventDefault(); prefs.close(); });

  // the volume sliders: icon_new_size of the bar icon, 0-64 across the back icon's width
  const back = panes.sound.icons[SOUND.FX_BACK].bbox;
  const sliderOff = back.x0, sliderX = back.x1 - back.x0;
  const setBar = (i, vol) => { const ic = panes.sound.icons[i]; ic.moveTo({ ...ic.bbox, x1: ic.bbox.x0 + Math.trunc(vol * (sliderX / 64)) }); };

  const sel = (w, i, on) => w.icons[i]?.setState({ selected: !!on });
  function showKeys() {                                  // keys_show_keys
    for (const i of [PREFS.KEYS, PREFS.SOUND, PREFS.MISC, PREFS.ADV]) sel(prefs, i, selected === i);
    panes.keys.icons[KEYSW.UP].setText(keyName(keys.up));
    panes.keys.icons[KEYSW.DOWN].setText(keyName(keys.down));
    panes.keys.icons[KEYSW.LEFT].setText(keyName(keys.left));
    panes.keys.icons[KEYSW.RIGHT].setText(keyName(keys.right));
    sel(panes.sound, SOUND.SOUND, keys.soundFx); sel(panes.sound, SOUND.INGAME, keys.ingame); sel(panes.sound, SOUND.INTRO, keys.intro);
    setBar(SOUND.FX_VOLUME, keys.fxVol); setBar(SOUND.MUSIC_VOLUME, keys.musicVol);
    sel(panes.misc, MISC.SAVE, keys.saveHi); sel(panes.misc, MISC.AUTO, keys.autoRepeat);
    [ADV.VHIGH, ADV.HIGH, ADV.MEDIUM, ADV.LOW].forEach((i, n) => sel(panes.advanced, i, keys.musicSpeed === n));
    sel(panes.advanced, ADV.NORMAL, keys.update === 0); sel(panes.advanced, ADV.SLOWER, keys.update === 1);
    temp = { ...keys };
    if (prefs.isOpen) prefs.open({ behind: 'top' }); else prefs.open({ behind: 'top' });
    joinPane();
  }
  const apply = () => { for (const k of PREF_ORDER) keys[k] = temp[k]; };
  const closePrefs = () => { prefs.close(); };

  prefs.on('click', (ev) => {
    if (ev.button === 'menu') return true;
    const i = ev.iconIndex;
    let close = false;
    if (i === PREFS.OK) { apply(); close = true; }
    else if (i === PREFS.SAVE) { apply(); choicesWrite('Choices', writePrefs(keys)); close = true; }
    else if (i === PREFS.CANCEL) close = true;
    else if (PANE_OF[i]) {
      sel(prefs, i, true);
      if (i !== selected) { selected = i; joinPane(); }
    }
    if (close) { if (ev.button === 'select') closePrefs(); else showKeys(); }
    return true;
  });
  const keep = (w, fn) => w.on('click', (ev) => { if (ev.button === 'menu') return true; fn(ev.iconIndex, ev); return true; });
  keep(panes.keys, (i) => { if (i === KEYSW.CHANGE) changeKeys(); });
  keep(panes.sound, (i, ev) => {
    const click = ev.x - sliderOff;
    if (i === SOUND.SOUND) temp.soundFx ^= 1;
    else if (i === SOUND.INGAME) temp.ingame ^= 1;
    else if (i === SOUND.INTRO) temp.intro ^= 1;
    else if (i === SOUND.FX_BACK) { setBar(SOUND.FX_VOLUME, Math.trunc((click / sliderX) * 64)); temp.fxVol = Math.trunc((click / sliderX) * 64); }
    else if (i === SOUND.MUSIC_BACK) { setBar(SOUND.MUSIC_VOLUME, Math.trunc((click / sliderX) * 64)); temp.musicVol = Math.trunc((click / sliderX) * 64); }
    sel(panes.sound, SOUND.SOUND, temp.soundFx); sel(panes.sound, SOUND.INGAME, temp.ingame); sel(panes.sound, SOUND.INTRO, temp.intro);
  });
  keep(panes.misc, (i) => {
    if (i === MISC.SAVE) temp.saveHi ^= 1;
    else if (i === MISC.RESET) hi = resetHi();         // hopper_reset_hi: at once, whatever the other buttons do
    else if (i === MISC.AUTO) temp.autoRepeat ^= 1;
    sel(panes.misc, MISC.SAVE, temp.saveHi); sel(panes.misc, MISC.AUTO, temp.autoRepeat);
  });
  keep(panes.advanced, (i) => {
    const sp = [ADV.VHIGH, ADV.HIGH, ADV.MEDIUM, ADV.LOW].indexOf(i);
    if (sp >= 0) temp.musicSpeed = sp;
    if (i === ADV.NORMAL) temp.update = 0;
    if (i === ADV.SLOWER) temp.update = 1;
  });

  // keys_change_keys: the change box in the middle of the screen, then four keys
  let changing = null;
  function readKey(without) {
    return new Promise((resolve) => {
      let down = null;
      const kd = (e) => {
        const n = INTERNAL_OF(e);
        e.preventDefault(); e.stopPropagation();
        if (down != null || n == null || n < 3 || NOT_ALLOWED(n) || without.includes(n + 128)) return;
        down = n;
      };
      const ku = (e) => {
        if (down == null || INTERNAL_OF(e) !== down) return;
        e.preventDefault(); e.stopPropagation();
        done(down + 128);
      };
      const done = (v) => { window.removeEventListener('keydown', kd, true); window.removeEventListener('keyup', ku, true); changing = null; resolve(v); };
      changing = { cancel: () => done(null) };
      window.addEventListener('keydown', kd, true);
      window.addEventListener('keyup', ku, true);
    });
  }
  async function changeKeys() {
    if (changing) return;
    const r = wimp.screenRect(false);
    const cw = change.w, ch = change.h;
    change.open({ x: Math.round((r.w - cw) / 2), y: Math.round((r.h - ch) / 2), w: cw, h: ch, behind: 'top' });
    const got = [];
    for (const t of ['Up', 'Down', 'Left', 'Right']) {
      change.icons[CHANGE_STRING].setText(msg('PrKey', msg(t)));
      const k = await readKey(got);
      if (k == null) { change.close(); return; }
      got.push(k);
    }
    change.close();
    [temp.up, temp.down, temp.left, temp.right] = got;
    panes.keys.icons[KEYSW.UP].setText(keyName(temp.up));
    panes.keys.icons[KEYSW.DOWN].setText(keyName(temp.down));
    panes.keys.icons[KEYSW.LEFT].setText(keyName(temp.left));
    panes.keys.icons[KEYSW.RIGHT].setText(keyName(temp.right));
  }

  // ------------------------------------------------------------------ icon bar (iconbar.c)
  const menu = () => new Menu('Hopper', [                // info_APPNAME
    { text: msg('M00'), submenu: proginfo },
    { text: msg('M01'), action: () => showKeys() },
    { text: msg('M02'), action: () => task.quit() },
  ]);
  task.addIconbarIcon({
    sprite: '!hopper',
    side: 'right',
    onClick: (ev) => { if (ev.button !== 'menu') go(); },
    menu,
    help: 'This is the Hopper icon.|MClick SELECT to play Hopper.',
  });

  task.onMessage('Quit', () => task.quit());
  task.on('quit', () => {
    changing?.cancel();
    playing = false;                                    // game.frame() then throws and the screen is released
    screenHandle?.release();
    try { qtm.release(); } catch { /* */ }
    if (keys.saveHi === 1) choicesWrite('HiScores', writeHi(hi));    // keys_finished
  });
  task.hopper = { go, get game() { return game; }, keys, get hi() { return hi; }, qtm, Q, prefs, panes, change, proginfo, showKeys, running: false, keyBuffer, samples, songs };
}
