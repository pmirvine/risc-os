// !CDPlayer 1.14 - native port of Sources/Apps/CDPlayer/c/cdplayer (the "Audio Panel").
//
// Windows from the original Templates (MainWindow, Keypad, Memory, Control = Setup, ProgInfo) with the
// panel's own sprite file (<AudioPanel$Dir>.sprites: buttons, LED digits kb0-9 / 0-9, slider, logo).
// The computer has a CD-ROM drive with no disc in it, so every CDFS call that needs a disc fails as it
// does on a real machine with an empty drive: CD_AudioStatus returns an error on each null event, the
// panel stays in its "no disc" state (track display "--", disc info 00/00:00, knob at the left), PLAY /
// PAUSE light only while the button is held, the transport buttons and keypad just press and release,
// and EJECT does nothing (ProcessIcon returns FALSE without a disc). The drive setup window works:
// the SCSI device / logical unit / card numbers are kept in <AudioPanel$Dir>.config, the 20-byte
// control block (device, card, unit, type, reserved) the original reads at start-up and rewrites
// after every click in the Setup window.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { loadTemplates } from '../../core/templates.js';
import { os } from '../../core/os.js';

// ---------------------------------------------------------------- constants (c/cdplayer)
const PROGRAM_NAME = 'CD Player';
const VERSION = '1.14 (18 Oct 1993)';
const REFRESH_RATE = 500;          // ms (50 cs) between display refreshes
const PROGRAM_TIMEOUT = 5000;      // ms (500 cs)
const EMPTY = -1, ERROR = -2;
const ABSOLUTE = 0, RELATIVE = 1, REMAINING = 2;

// main window icons
const SKIP_PREV = 0, SKIP_NEXT = 1, FAST_BACK = 2, PLAY = 3, FAST_FORW = 4, PAUSE = 5, STOP = 6, EJECT = 7;
const LOGO = 8, SLIDERBAR = 9, CUR_TRACK_1 = 10, CUR_TRACK_2 = 11;
const MAX_TRACK_1 = 12, MAX_TRACK_2 = 13, MAX_MIN_1 = 14, MAX_MIN_2 = 15, MAX_SEC_1 = 16, MAX_SEC_2 = 17;
const CUR_MIN_1 = 18, CUR_MIN_2 = 19, CUR_SEC_1 = 20, CUR_SEC_2 = 21, SLASH = 22, MAX_COLON = 23, CUR_COLON = 24;
const SLIDERKNOB = 26;
// keypad icons
const KP_ALL = 10, KP_RND = 11, KP_MEM = 12, KP_CLR = 13, KP_RPT = 14;
// setup icons
const SU_DEV_MINUS = 0, SU_DEV_PLUS = 1, SU_UNI_MINUS = 2, SU_UNI_PLUS = 3, SU_CAR_MINUS = 4, SU_CAR_PLUS = 5;
const SU_DEV = 6, SU_UNI = 7, SU_CAR = 8;

// ---------------------------------------------------------------- interactive help (GiveHelp)
const HELP_MAIN = {
  [-1]: 'This is the Audio Panel main window.',
  [EJECT]: 'This is the EJECT button.', [FAST_BACK]: 'This is the FAST BACKWARD button.',
  [FAST_FORW]: 'This is the FAST FORWARD button.', [PAUSE]: 'This is the PAUSE button.',
  [PLAY]: 'This is the PLAY button.', [SKIP_NEXT]: 'This is the SKIP FORWARD button.',
  [SKIP_PREV]: 'This is the SKIP BACKWARD button.', [STOP]: 'This is the STOP button.',
  [CUR_TRACK_1]: 'This is the track display.', [CUR_TRACK_2]: 'This is the track display.',
  [LOGO]: 'Click SELECT to bring up the programming keypad.',
  [SLIDERBAR]: 'This represents the total disc space.|MClick SELECT to move the pick-up to any position on the disc.',
  [SLIDERKNOB]: 'Current position of the pick-up.|MYou can drag it to any part of the disc.',
};
for (const i of [CUR_MIN_1, CUR_MIN_2, CUR_SEC_1, CUR_SEC_2, CUR_COLON]) HELP_MAIN[i] = 'Click SELECT to switch the display between the following:|Melapsed disc time/elapsed track time/remaining disc time.';
for (const i of [MAX_TRACK_1, MAX_TRACK_2]) HELP_MAIN[i] = 'Highest track number available on the disc.';
for (const i of [MAX_MIN_1, MAX_MIN_2, MAX_SEC_1, MAX_SEC_2, MAX_COLON]) HELP_MAIN[i] = 'Total size of the disc in minutes and seconds.';
const HELP_KEYPAD = {
  [-1]: 'This is the Audio Panel keypad window.',
  [KP_ALL]: 'Click SELECT to put ALL the audio tracks into memory.',
  [KP_CLR]: 'Click SELECT to remove the HIGHLIGHTED tracks from memory.|MClick ADJUST to remove ALL the tracks from memory.',
  [KP_MEM]: 'Select the track number using the keypad buttons.|MClick SELECT to add track to memory.',
  [KP_RND]: 'Click SELECT to put ALL the audio tracks into memory in random order.',
  [KP_RPT]: 'Click SELECT to switch on/off the REPEAT function.',
};
for (let i = 0; i <= 9; i++) HELP_KEYPAD[i] = 'This is a number button.';
const HELP_SETUP = {
  [-1]: 'This is the Audio Panel setup window.',
  [SU_DEV]: 'This is the SCSI DEVICE number.', [SU_UNI]: 'This is the LOGICAL UNIT number.', [SU_CAR]: 'This is the CARD slot number.',
};
for (const i of [SU_DEV_MINUS, SU_DEV_PLUS]) HELP_SETUP[i] = 'Click SELECT to change the SCSI DEVICE number.';
for (const i of [SU_UNI_MINUS, SU_UNI_PLUS]) HELP_SETUP[i] = 'Click SELECT to change the LOGICAL UNIT number.';
for (const i of [SU_CAR_MINUS, SU_CAR_PLUS]) HELP_SETUP[i] = 'Click SELECT to change the CARD slot number.';

// ---------------------------------------------------------------- the CD-ROM drive (CDFS driver SWIs)
// A drive is fitted and configured, but its drawer is empty: the SWIs that need a disc return
// CDFSDriver's "no disc" error, the others succeed.
class CDError extends Error {}
export const drive = {
  disc: null,        // null = no disc in the drive
  audioStatus() { if (!this.disc) throw new CDError('Drive empty'); return 5; },   // CD_AudioStatus
  enquireTrack() { if (!this.disc) throw new CDError('Drive empty'); return null; },
  identify() { return -1; },                                                        // CD_Identify: type unknown (-1 → keep)
  openDrawer() { /* CD_OpenDrawer: the (empty) drawer opens */ },
  stopDisc() { if (!this.disc) throw new CDError('Drive empty'); },
};

export default async function start(task, ctx) {
  const vfs = os.vfs;
  const dir = ctx.dir ?? os.sysvars.get('AudioPanel$Dir') ?? ctx.app.appDir;
  const [tpl, area] = await Promise.all([
    loadTemplates('assets/templates/CDPlayer.json'),
    os.sprites.loadManifest('CDPlayer', 'sprites'),     // resspr_init(): <AudioPanel$Dir>.sprites
  ]);

  // ---------------------------------------------------------------- state (globals of c/cdplayer)
  let mainOpen = false, keypadOpen = false, memoryOpen = false;
  let repeat = false, paused = false, playing = false, discIn = false, stopped = false;
  let dispmode = ABSOLUTE;
  let progTimeout = 0, display = 0, memory = 0, trackindex = 0;

  // InitControlBlock(): <AudioPanel$Dir>.config, else all zero
  const control = { device: 0, card: 0, unit: 0, type: 0, reserved: 0 };
  try {
    const b = await vfs.readFile(`${dir}.config`);
    if (b.length >= 20) {
      const dv = new DataView(b.buffer, b.byteOffset, 20);
      control.device = dv.getInt32(0, true); control.card = dv.getInt32(4, true); control.unit = dv.getInt32(8, true);
      control.type = dv.getInt32(12, true); control.reserved = dv.getInt32(16, true);
    }
  } catch { /* no config file: defaults */ }
  const changeDriveType = () => { const t = drive.identify(control); if (t !== -1) control.type = t; };
  changeDriveType();
  const saveConfig = () => {
    const b = new Uint8Array(20), dv = new DataView(b.buffer);
    [control.device, control.card, control.unit, control.type, control.reserved].forEach((v, i) => dv.setInt32(i * 4, v, true));
    try { vfs.writeFile(`${dir}.config`, b, { filetype: 0xFFD }); } catch { /* read-only: fopen fails silently */ }
  };

  // ---------------------------------------------------------------- windows
  const make = (name) => {
    const w = wimp.createWindowFromTemplate(tpl, name, { spriteArea: area }, task);
    w.on('close', () => { closeWin(w); return false; });
    return w;
  };
  const main = make('MainWindow'), keypad = make('Keypad'), memWin = make('Memory'), setup = make('Control');
  const help = (w, table) => w.on('helprequest', (ev) => { ev.text = table[ev.icon ? ev.icon.handle ?? w.icons.indexOf(ev.icon) : -1] ?? null; });
  help(main, HELP_MAIN); help(keypad, HELP_KEYPAD); help(setup, HELP_SETUP);
  memWin.on('helprequest', (ev) => { ev.text = ev.icon ? 'Click SELECT to highlight this entry to use with the keypad CLR button.' : 'This is the Audio Panel memory window.'; });
  // the memory entry icon is only a template for the programmed tracks (deleted at initialise)
  const entryTemplate = memWin.icons[0];
  entryTemplate?.setState({ deleted: true });

  const M = main.icons;
  const sel = (w, i, on) => w.icons[i]?.setState({ selected: !!on });
  const setSprite = (w, i, name) => { const ic = w.icons[i]; if (ic && ic.spriteName !== name) { ic.setValidation('S' + name); ic.setSprite(name); } };

  function closeWin(w) {
    w.close();
    if (w === main) {
      mainOpen = false;
      if (memoryOpen) { memWin.close(); memoryOpen = false; }
      if (keypadOpen) { keypad.close(); keypadOpen = false; }
    } else if (w === keypad) keypadOpen = false;
    else if (w === memWin) memoryOpen = false;
  }

  // wait for all mouse buttons to be released (the `while (OS_Mouse ... r2)` loops)
  const released = () => new Promise((resolve) => {
    const up = () => { document.removeEventListener('pointerup', up, true); resolve(); };
    document.addEventListener('pointerup', up, true);
    setTimeout(up, 3000);   // never hang if the release is lost
  });

  // ---------------------------------------------------------------- display
  let lasttrack = EMPTY;
  function updateTrackDisplay(track) {
    if (lasttrack === track) return;
    lasttrack = track;
    const [a, b] = track === EMPTY ? ['-', '-'] : track === ERROR ? ['e', 'e'] : [String((track / 10) | 0), String(track % 10)];
    setSprite(main, CUR_TRACK_1, a); setSprite(main, CUR_TRACK_2, b);
  }
  const mmssff = (blocks) => ({ m: (blocks / 4500) | 0, s: ((blocks % 4500) / 75) | 0 });
  const kb = (i, n) => setSprite(main, i, 'kb' + n);
  function updateTimeDisplay(active) {
    const t = active ? 0 : 0;         // no sub-channel data without a disc
    const { m, s } = mmssff(t);
    kb(CUR_MIN_1, (m / 10) | 0); kb(CUR_MIN_2, m % 10); kb(CUR_SEC_1, (s / 10) | 0); kb(CUR_SEC_2, s % 10);
    redrawSlider(0);
  }
  function displayDiscInfo() {
    const { m, s } = mmssff(0), track = 0;
    kb(MAX_TRACK_1, (track / 10) | 0); kb(MAX_TRACK_2, track % 10);
    kb(MAX_MIN_1, (m / 10) | 0); kb(MAX_MIN_2, m % 10); kb(MAX_SEC_1, (s / 10) | 0); kb(MAX_SEC_2, s % 10);
    if (discIn) updateTrackDisplay(0);
  }
  // the slider knob icon is re-created at x = ix0 + curpos (OS units)
  const knob = M[SLIDERKNOB], knobBox = knob ? { ...knob.bbox } : null;
  let curpos = 0;
  function redrawSlider(newpos) {
    if (newpos === curpos || !knob) return;
    curpos = newpos;
    knob.moveTo({ ...knobBox, x0: knobBox.x0 + newpos / 2, x1: knobBox.x1 + newpos / 2 });
  }
  let oldpaused = false, oldplaying = false;
  function setButton(b) {
    if (b === PAUSE && paused !== oldpaused) { oldpaused = paused; sel(main, PAUSE, paused); }
    if (b === PLAY && playing !== oldplaying) { oldplaying = playing; sel(main, PLAY, playing); }
  }
  function discHasGone() {
    discIn = false;
    updateTrackDisplay(EMPTY);
    updateTimeDisplay(false);
    paused = false; playing = false;
    setButton(PAUSE); setButton(PLAY);
    repeat = false; sel(keypad, KP_RPT, false);
    displayDiscInfo();
    memory = 0;
    if (memoryOpen) { memWin.close(); memoryOpen = false; }
    if (keypadOpen) { keypad.close(); keypadOpen = false; }
  }
  // UpdateDisplay(): CD_AudioStatus on every null event
  function updateDisplay() {
    let status;
    try { status = drive.audioStatus(control); } catch {
      if (discIn) discHasGone();
      return;
    }
    // (a disc appeared: never happens with the empty drive)
    void status;
    setButton(PAUSE); setButton(PLAY);
  }

  // ---------------------------------------------------------------- actions
  function processIcon(i) {
    if (!discIn) return false;
    if (!trackindex) { if (i === EJECT) eject(); return true; }
    return true;
  }
  function eject() { drive.openDrawer(control); discHasGone(); }

  function openMain() {
    if (!mainOpen) updateDisplay();
    main.open({ behind: 'top' });
    mainOpen = true;
  }
  function openKeypad() {
    if (!mainOpen) openMain();
    keypad.open({ behind: 'top' });
    keypadOpen = true;
  }
  let shown = { device: 255, card: 255, unit: 255 };
  function updateSetupDisplay() {
    if (control.device !== shown.device) { shown.device = control.device; setSprite(setup, SU_DEV, String(control.device)); }
    if (control.card !== shown.card) { shown.card = control.card; setSprite(setup, SU_CAR, String(control.card)); }
    if (control.unit !== shown.unit) { shown.unit = control.unit; setSprite(setup, SU_UNI, String(control.unit)); }
  }
  function openSetup() {
    setup.open({ behind: 'top' });
    shown = { device: 255, card: 255, unit: 255 };
    updateSetupDisplay();
  }

  // process_main()
  const busy = new Set();
  main.on('click', async (ev) => {
    if (ev.button === 'menu') return true;
    const i = ev.iconIndex;
    if (i === SLIDERKNOB || i === SLIDERBAR) processIcon(i);
    switch (i) {
      case EJECT: case STOP:
        if (busy.has(i)) return true;
        sel(main, i, true); processIcon(i); stopped = true; break;
      case PAUSE:
        paused = !discIn ? true : !paused;
        setButton(PAUSE); processIcon(i); break;
      case PLAY:
        stopped = false; playing = true;
        setButton(PLAY); processIcon(i); break;
      case FAST_BACK: case FAST_FORW: case SKIP_NEXT: case SKIP_PREV:
        if (busy.has(i)) return true;       // auto-repeat while held
        sel(main, i, true); processIcon(i); break;
      case CUR_MIN_1: case CUR_MIN_2: case CUR_SEC_1: case CUR_SEC_2: case CUR_COLON:
        dispmode = dispmode === ABSOLUTE ? RELATIVE : dispmode === RELATIVE ? REMAINING : ABSOLUTE;
        break;
      case LOGO: openKeypad(); break;
      default: break;
    }
    if ([PAUSE, PLAY, EJECT, FAST_BACK, FAST_FORW, SKIP_NEXT, SKIP_PREV, STOP].includes(i) && !busy.has(i)) {
      busy.add(i);
      await released();
      busy.delete(i);
      if (i === PAUSE || i === PLAY) {
        if (!discIn || !trackindex) { paused = false; playing = false; }
        setButton(PAUSE); setButton(PLAY);
      } else sel(main, i, false);
    }
    return true;
  });
  main.on('drag', () => true);

  // process_keypad()
  keypad.on('click', async (ev) => {
    if (ev.button === 'menu' || ev.iconIndex < 0 || ev.iconIndex == null) return true;
    const i = ev.iconIndex;
    if (busy.has('kp' + i)) return true;
    sel(keypad, i, true);
    if (discIn && trackindex) {
      if (i <= 9) { if (!progTimeout) display = 0; display = (display * 10 + i) % 100; updateTrackDisplay(display); }
      else if (i === KP_RPT) repeat = !repeat;
    }
    busy.add('kp' + i);
    await released();
    busy.delete('kp' + i);
    if (discIn && trackindex) {
      if (i !== KP_RPT) { sel(keypad, i, false); progTimeout = Date.now() + PROGRAM_TIMEOUT; } else if (!repeat) sel(keypad, KP_RPT, false);
    } else sel(keypad, i, false);
    return true;
  });

  // process_memory(): entries toggle their highlight (only with a disc)
  memWin.on('click', (ev) => {
    if (ev.button === 'menu') return true;
    if (discIn && trackindex && ev.icon) ev.icon.setState({ selected: !ev.icon.selected });
    return true;
  });

  // process_setup()
  setup.on('click', async (ev) => {
    if (ev.button === 'menu') return true;
    const i = ev.iconIndex;
    if (i == null || i < 0 || busy.has('su' + i)) return true;
    sel(setup, i, true);
    switch (i) {
      case SU_DEV_MINUS: if (control.device - 1 >= 0) control.device--; break;
      case SU_DEV_PLUS: if (control.device + 1 < 7) control.device++; break;
      case SU_CAR_MINUS: if (control.card - 1 >= 0) control.card--; break;
      case SU_CAR_PLUS: if (control.card + 1 < 4) control.card++; break;
      case SU_UNI_MINUS: if (control.unit - 1 >= 0) control.unit--; break;
      case SU_UNI_PLUS: if (control.unit + 1 < 8) control.unit++; break;
      default: break;
    }
    changeDriveType();
    updateSetupDisplay();
    busy.add('su' + i);
    await released();
    busy.delete('su' + i);
    if (i <= SU_CAR_PLUS) sel(setup, i, false);
    saveConfig();
    return true;
  });

  // ---------------------------------------------------------------- menu + icon bar
  const info = () => {
    const w = wimp.createWindowFromTemplate(tpl, 'ProgInfo', {}, task);
    w.icons[4]?.setText(VERSION);        // dbox_setfield(d, info_field, Version_String)
    w.on('menuclosed', () => setTimeout(() => w.delete(), 0));
    return w;
  };
  const menu = () => new Menu(PROGRAM_NAME, [
    { text: 'Info', submenu: info },
    { text: 'Keypad', action: openKeypad },
    { text: 'Setup', action: openSetup },
    { text: 'Quit', action: () => task.quit() },
  ]);
  const bar = task.addIconbarIcon({
    sprite: 'logo2', area, side: 'right',
    onClick: (ev) => { if (ev.button !== 'menu') openMain(); },
    menu, help: 'This is the Audio Panel icon.',
  });
  void bar;

  // the main event loop: display refresh every REFRESH_RATE when no keypad entry is pending
  task.every(REFRESH_RATE, () => {
    if (!progTimeout) updateDisplay();
    else if (Date.now() >= progTimeout) { updateTrackDisplay(0); progTimeout = 0; display = 0; }
  });
  task.onMessage('Quit', () => task.quit());

  // for tests / other code
  task.cdplayer = {
    main, keypad, memory: memWin, setup, control,
    get state() { return { discIn, playing, paused, repeat, dispmode, mainOpen, keypadOpen, memoryOpen, memory }; },
  };
}
