// !Player - "Player for sample data" (Expressive Software Projects / Acorn, 1.23 22-Nov-94).
// A port of the BASIC !RunImage: the Player window (play / pause / stop / loop / mute, time bar,
// volume bar), the "Control" (Options) dialogue for raw sample formats, icon bar menu.
// Sound is played with WebAudio (see audio.js).

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { os } from '../../core/os.js';
import { loadMessages } from '../../core/messages.js';
import { SpriteInfo } from '../../core/sprites.js';
import { parseARMovie, decodeARMovieSound, parseWav, decodeWav, decodeRaw, Voice } from './audio.js';

const TPL = 'assets/templates/Player.json';
// Player window icons
const P = { play: 2, pause: 3, vol: 4, stop: 5, volUp: 7, volDown: 8, time: 9, loop: 10, file: 11, fast: 12, back: 13, mute: 14, length: 15, desc: 16, control: 17 };
// Options ("Control") window icons
const O = { signed: 4, unsigned: 5, arclog: 6, adpcm: 7, b4: 8, b8: 9, b12: 10, b16: 11, reversed: 12, mono: 13, stereo: 14, up: 16, down: 17, rate: 18, rateMenu: 20, cancel: 21, set: 22 };
const TYPE_ICONS = [O.signed, O.unsigned, O.arclog, O.adpcm];
const TYPE_NAMES = ['signed', 'unsigned', 'mulaw', 'adpcm'];
const BITS = { 4: O.b4, 8: O.b8, 12: O.b12, 16: O.b16 };
// Sound_SampleRate list on a RiscPC with 16 bit sound
const RATES = [5513, 6615, 8269, 11025, 13230, 16538, 22050, 33075, 44100];
const KNOWN = [0xAE7, 0xD3C, 0xBD6, 0xFB1, 0xBF7, 0xFE4, 0xFFA];

export default async function start(task, ctx) {
  const msgs = await loadMessages('Player');
  const M = (t, ...a) => msgs.lookup(t, ...a);
  const area = new Map(await os.sprites.loadManifest('Player', 'Sprites22'));
  const tpl = await (await import('../../core/templates.js')).loadTemplates(TPL);

  const player = wimp.createWindowFromTemplate(tpl, 'Player', { spriteArea: area }, task);
  const opts = wimp.createWindowFromTemplate(tpl, 'Options', { spriteArea: area }, task);
  const info = wimp.createWindowFromTemplate(tpl, 'Info', {}, task);
  info.icons[4].setText(ctx.app.info.version);
  const PI = player.icons, OI = opts.icons;
  // the template position is for a taller screen mode: keep the window clear of the icon bar
  const ibTop = wimp.height - (wimp.iconbar?.height ?? 68) - 24;
  if (player.y + player.h > ibTop) player.y = Math.max(40, ibTop - player.h);

  // -------------------------------------------------------------- state
  const fmt = { type: 0, bits: 8, channels: 1, reversed: false, rate: 44100 };
  let volume = 128, muted = false;
  let src = null;        // {kind: 'movie'|'wav'|'raw', bytes (sample data), snd, path, filetype}
  const voice = new Voice();
  voice.onend = () => { stopped(); };

  // -------------------------------------------------------------- range sprites (time / volume bars)
  const base = { bar: area.get('bar'), vol: area.get('vol') };
  function rangeSprite(name, value, max) {
    const b = base[name];
    if (!b) return;
    const c = document.createElement('canvas');
    c.width = b.w; c.height = b.h;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, b.w, b.h);
    const mid = max > 0 ? Math.round((value * b.w) / max) : 0;
    g.fillStyle = '#000000'; g.fillRect(0, 0, Math.max(0, Math.min(b.w, mid)), b.h);
    area.set(name, new SpriteInfo({ name, w: b.w, h: b.h, osW: b.osW, osH: b.osH, url: c.toDataURL(), canvas: c }));
    PI[name === 'bar' ? P.time : P.vol].render();
  }

  // -------------------------------------------------------------- format / description
  const selectESG = (w, icon, group) => { for (const i of group) w.icons[i].setState({ selected: i === icon }); };
  const selectedIn = (w, group) => group.find((i) => w.icons[i].selected);
  function fmtDescription() {
    let d = OI[TYPE_ICONS[fmt.type]].text;
    if (fmt.bits !== 4) d += ' ' + M('Bit' + fmt.bits);
    d += ', ' + OI[fmt.channels === 2 ? O.stereo : O.mono].text;
    d += ', ' + fmt.rate + ' Hz';
    return d;
  }
  // shading of the Bits radio icons for a type (PROCshade: bit n set = shaded, 4,8,12,16)
  function shadeBits(type) {
    const mask = type === 2 ? 0b1101 : type === 3 ? 0b1110 : 0b0001;
    [O.b4, O.b8, O.b12, O.b16].forEach((ic, n) => OI[ic].setState({ shaded: !!(mask & (1 << n)) }));
    if (type === 2) selectESG(opts, O.b8, [O.b4, O.b8, O.b12, O.b16]);
    if (type === 3) selectESG(opts, O.b4, [O.b4, O.b8, O.b12, O.b16]);
    if ((type === 0 || type === 1) && OI[O.b4].selected) selectESG(opts, O.b8, [O.b4, O.b8, O.b12, O.b16]);
  }
  /** Copy the current format into the Options window (PROCGetType(FALSE, ...)). */
  function fmtToOptions() {
    selectESG(opts, TYPE_ICONS[fmt.type], TYPE_ICONS);
    selectESG(opts, BITS[fmt.bits] ?? O.b8, Object.values(BITS));
    selectESG(opts, fmt.channels === 2 ? O.stereo : O.mono, [O.mono, O.stereo]);
    OI[O.reversed].setState({ selected: fmt.reversed });
    OI[O.rate].setText(String(fmt.rate));
    shadeBits(fmt.type);
  }
  /** Read the Options window into the format (PROCGetType(TRUE, TRUE)). Returns false on error. */
  async function optionsToFmt() {
    const t = TYPE_ICONS.indexOf(selectedIn(opts, TYPE_ICONS));
    shadeBits(t);
    const b = +Object.keys(BITS).find((k) => OI[BITS[k]].selected) || 8;
    let rate = parseInt(OI[O.rate].text, 10) || 0;
    if (rate < 1000) {
      await task.reportError(M('Report2'));
      OI[O.rate].setText(String(fmt.rate));
      return false;
    }
    if (t === 3 && !RATES.includes(rate)) {
      await task.reportError(M('Report3'));
      rate = [...RATES].reverse().find((r) => r < rate) ?? RATES[0];
      OI[O.rate].setText(String(rate));
    }
    Object.assign(fmt, { type: t < 0 ? 0 : t, bits: b, channels: OI[O.stereo].selected ? 2 : 1, reversed: OI[O.reversed].selected, rate });
    return true;
  }
  function showFormat() {
    PI[P.desc].setText(fmtDescription());
    const secs = Math.floor(voice.frames ? voice.duration : 0);
    PI[P.length].setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    rangeSprite('bar', voice.position, voice.duration);
  }

  // -------------------------------------------------------------- loading
  function decodeWithFmt(bytes) {
    return { rate: fmt.rate, channels: decodeRaw(bytes, { type: TYPE_NAMES[fmt.type], bits: fmt.bits, channels: fmt.channels, reversed: fmt.reversed }) };
  }
  async function load(file) {
    let type = file.filetype;
    if (type > 0xFFF || file.type === 'dir') { task.reportError(M('Report0')); return; }
    const leaf = os.vfs.leaf(file.path);
    let raw = false;
    if (!KNOWN.includes(type)) {
      const tn = os.sysvars.get('File$Type_' + type.toString(16).toUpperCase().padStart(3, '0')) ?? type.toString(16).toUpperCase();
      const r = await task.reportError(M('Report1', '', tn, leaf), { cancel: true, category: 'question' });
      if (r !== 1) return;
      raw = true;
    }
    let bytes;
    try { bytes = await os.vfs.readFile(file.path); } catch (e) { task.reportError(e.message); return; }
    stop(true);
    let snd = null;
    const mv = !raw && parseARMovie(bytes);
    const wav = !raw && !mv && parseWav(bytes);
    if (mv) {
      if (!mv.hasSound) { task.reportError(M('Report4')); return; }
      snd = decodeARMovieSound(bytes, mv);
      Object.assign(fmt, { type: TYPE_NAMES.indexOf(mv.encoding), bits: mv.bits, channels: mv.channels === 2 ? 2 : 1, reversed: mv.reversed, rate: mv.rate });
      src = { kind: 'movie', snd };
    } else if (wav && wav.type !== 'imaadpcm') {
      snd = decodeWav(wav);
      const t = wav.type === 'ulaw' || wav.type === 'alaw' ? 2 : wav.bits === 8 ? 1 : 0;
      Object.assign(fmt, { type: t, bits: wav.bits === 8 || t === 2 ? 8 : 16, channels: wav.channels === 2 ? 2 : 1, reversed: false, rate: wav.rate });
      src = { kind: 'wav', bytes: wav.data, snd };
    } else {
      snd = decodeWithFmt(bytes);
      src = { kind: 'raw', bytes, snd };
    }
    if (!snd) { task.reportError(M('Report0')); return; }
    src.path = file.path;
    voice.load(snd, fmt.rate);
    voice.setLoop(PI[P.loop].selected);
    fmtToOptions();
    PI[P.file].setText(leaf.slice(-10));
    player.setTitle(file.path);
    showFormat();
    player.close();
    player.open({ behind: 'top' });
  }

  // -------------------------------------------------------------- transport
  function setVolume(v) {
    volume = Math.max(0, Math.min(128, v));
    voice.setVolume(volume / 128);
    rangeSprite('vol', volume, 128);
  }
  function play() {
    if (!src || voice.playing) return;
    if (!voice.play(voice.paused ? voice.position : voice.position)) return;
    PI[P.play].setState({ selected: true });
    if (PI[P.pause].selected) { voice.pause(); }
  }
  function stopped() {
    PI[P.play].setState({ selected: false });
    if (!voice.playing && !voice.paused) rangeSprite('bar', 0, voice.duration);
  }
  function stop(reset) {
    voice.stop();
    PI[P.play].setState({ selected: false });
    if (PI[P.pause].selected) PI[P.pause].setState({ selected: false });
    if (muted) { muted = false; voice.setMute(false); PI[P.mute].setState({ selected: false }); }
    if (reset) rangeSprite('bar', 0, voice.duration);
  }
  function timeAt(sx) {
    const ic = PI[P.time];
    const b = base.bar;
    const x0 = player.workToScreen(ic.bbox.x0, 0).x + ((ic.bbox.x1 - ic.bbox.x0) - (b?.cssW ?? 360)) / 2;
    const f = Math.max(0, Math.min(1, (sx - x0) / (b?.cssW ?? 360)));
    return f * voice.duration;
  }
  function volAt(sx) {
    const ic = PI[P.vol];
    const x0 = player.workToScreen(ic.bbox.x0, 0).x + ((ic.bbox.x1 - ic.bbox.x0) - (base.vol?.cssW ?? 256)) / 2;
    return Math.round(((sx - x0) / (base.vol?.cssW ?? 256)) * 128);
  }
  function changeTime(sx) {
    if (!src) return;
    const t = timeAt(sx);
    if (voice.playing) voice.seek(t); else { voice.seek(t); if (!voice.paused) voice.paused = false; }
    rangeSprite('bar', t, voice.duration);
  }

  // -------------------------------------------------------------- window events
  player.on('click', (ev) => {
    if (ev.button === 'menu') return;
    const i = ev.iconIndex;
    const sel = ev.button === 'select', adj = ev.button === 'adjust';
    switch (i) {
      case P.control: fmtToOptions(); wimp.menus.open(opts, ev.sx - 64, ev.sy, { task }); break;
      case P.play: if (!voice.playing) play(); else PI[P.play].setState({ selected: true }); break;
      case P.stop: stop(!voice.playing); break;
      case P.loop: voice.setLoop(PI[P.loop].selected); break;
      case P.pause:
        if (PI[P.pause].selected) voice.pause(); else if (voice.paused) { voice.resume(); if (voice.playing) PI[P.play].setState({ selected: true }); }
        break;
      case P.vol: if (sel) setVolume(volAt(ev.sx)); break;
      case P.time: if (sel && src) changeTime(ev.sx); break;
      case P.volDown: setVolume(volume + (sel ? -1 : adj ? 1 : 0) * (ev.shift ? 10 : 1)); break;
      case P.volUp: setVolume(volume + (sel ? 1 : adj ? -1 : 0) * (ev.shift ? 10 : 1)); break;
      case P.mute: muted = PI[P.mute].selected; voice.setMute(muted); break;
      default: break;
    }
    return true;
  });
  player.on('drag', (ev) => {
    const i = ev.iconIndex;
    if (i !== P.vol && !(i === P.time && src)) return;
    wimp.drag({ type: 'point', event: ev.pointerEvent, onMove: (s) => (i === P.vol ? setVolume(volAt(s.sx)) : changeTime(s.sx)) });
    return true;
  });
  player.on('dataload', (ev) => { load(ev.files[0]); return true; });

  // Options window (a menu dialogue box)
  let rateMenu = null;
  opts.on('click', async (ev) => {
    const i = ev.iconIndex;
    const cur = parseInt(OI[O.rate].text, 10) || fmt.rate;
    const step = ev.shift ? 10 : 1;
    if (i === O.up || i === O.down) {
      const up = (i === O.up) === (ev.button !== 'adjust');
      OI[O.rate].setText(String(Math.max(1000, Math.min(99999, cur + (up ? step : -step)))));
    } else if (i === O.rateMenu) {
      rateMenu = new Menu(M('rateM0'), RATES.map((r) => ({ text: String(r), ticked: () => parseInt(OI[O.rate].text, 10) === r, action: () => {
        OI[O.rate].setText(String(r));
        wimp.menus.open(opts, opts.x, opts.y, { task });
      } })));
      const mm = wimp.menus;
      const x = opts.workToScreen(OI[O.rateMenu].bbox.x1, 0).x + 4, y = opts.workToScreen(0, OI[O.rateMenu].bbox.y0).y;
      if (mm.isOpen && mm._openLevel) mm._openLevel(mm.levels.length, rateMenu, x, y); else mm.open(rateMenu, x, y, { task });
    } else if (i === O.set) {
      if (!(await optionsToFmt())) return true;
      stop(true);
      if (src && src.kind !== 'movie') {
        src.snd = decodeWithFmt(src.bytes);
        voice.load(src.snd, fmt.rate);
      } else if (src) voice.setRate(fmt.rate);
      voice.setLoop(PI[P.loop].selected);
      showFormat();
      if (ev.button === 'select') wimp.menus.close();
    } else if (i === O.cancel) {
      fmtToOptions();
      if (ev.button === 'select') wimp.menus.close();
    } else if (TYPE_ICONS.includes(i)) {
      shadeBits(TYPE_ICONS.indexOf(i));
    }
    return true;
  });

  // -------------------------------------------------------------- icon bar, menus
  const iconMenu = new Menu(M('iconM0'), [
    { text: M('iconM1'), submenu: info },
    { text: M('iconM2'), action: () => task.quit() },
  ]);
  task.addIconbarIcon({
    sprite: ctx.app.sprite,
    onClick: (ev) => { if (ev.button === 'select') player.open({ behind: 'top' }); },
    menu: iconMenu,
    onDataLoad: (ev) => load(ev.files[0]),
    help: '\\TPlayer icon.|MClick \\s to open the Player window.|MDrag a sound file here to load it.',
  });
  task.onMessage('Quit', () => task.quit());
  task.on('quit', () => voice.stop());

  // null events: keep the time bar up to date while playing
  let lastSec = -1;
  task.every(100, () => {
    if (!voice.playing) return;
    const s = Math.floor(voice.position * 4);
    if (s !== lastSec) { lastSec = s; rangeSprite('bar', voice.position, voice.duration); }
  });

  // initial state (PROCGetType(TRUE,TRUE), PROCSetVolume(-2))
  await optionsToFmt();
  showFormat();
  setVolume(volume);
  if (ctx.file && os.vfs.exists(ctx.file)) load(os.vfs.stat(ctx.file));
}
