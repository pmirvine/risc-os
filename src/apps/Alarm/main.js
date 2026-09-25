// !Alarm 2.70 (RISC OS 3.71) re-implemented in JavaScript.
//
// Icon bar clock (analogue with/without seconds, HH:MM, HH:MM:SS or a user-defined Territory
// format), Set alarm / Change alarm windows (the real "alarm" template: time/date adjusters,
// three message lines, Urgent, Task alarm, Working week, repeating every N units or on the
// Nth weekday of every M months), alarm browser ("browser" + "browse1" header pane), alarm going
// off ("message" window with Accept / Cancel / Defer menu, beeping), Setup, Set clock, Find
// alarm, Info. Alarms are kept in Choices:Alarm.Alarms (type &AE9) and the setup in
// Choices:Alarm.Setup; "Save as text" / "Save as alarms" use the standard save box.

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { loadMessages } from '../../core/messages.js';
import { loadTemplates } from '../../core/templates.js';
import { SpriteInfo } from '../../core/sprites.js';
import { saveAs } from '../../core/dialogs.js';
import { fonts } from '../../core/fonts.js';
import { os } from '../../core/os.js';
import { formatTime, DAYS, MONTHS, ordinal } from './timefmt.js';

const UNITS = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'];
const ALARMS_READ = 'Choices:Alarm.Alarms';
const SETUP_READ = 'Choices:Alarm.Setup';
const LS_KEY = 'riscos371.alarm';

const DEFAULT_SETUP = {
  silent: false,               // alarms are silent unless urgent
  workWeek: false,             // repeating alarms fit into a working week
  days: [false, true, true, true, true, true, false],
  continuous: false, beepSecs: 10,
  autoSave: true, confirm: true,
  display: 'hhmm',             // 'anasec' | 'ana' | 'hhmm' | 'hhmmss' | 'user'
  userFormat: '%z12:%mi:%se',
  bst: false,
};

export default async function start(task, ctx) {
  const [M, tpl] = await Promise.all([loadMessages('Alarm'), loadTemplates('assets/templates/Alarm.json')]);
  const m = (t, ...a) => M.lookup(t, ...a);
  const vfs = os.vfs;

  // ------------------------------------------------------------------ state
  let setup = { ...DEFAULT_SETUP };
  let alarms = [];               // {id, t, msg:[3], urgent, isTask, workWeek, repeat}
  let nextId = 1;
  let clockOffset = 0;           // "Set clock": offset from the host clock (ms)
  let modified = false;
  let filename = null;           // browser title
  const now = () => new Date(Date.now() + clockOffset);

  // ------------------------------------------------------------------ persistence
  const serialise = () => 'ALRM' + JSON.stringify({ version: 1, alarms: alarms.map(({ id, ...a }) => a) }) + '\n';
  function parseAlarms(text) {
    if (!text.startsWith('ALRM')) throw new Error(m('OkayA3', ''));
    const j = JSON.parse(text.slice(4));
    return (j.alarms ?? []).map((a) => ({ ...a, id: nextId++ }));
  }
  async function loadState() {
    try { const ls = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'); clockOffset = ls.clockOffset ?? 0; } catch { /* */ }
    try {
      if (vfs.exists(SETUP_READ)) setup = { ...DEFAULT_SETUP, ...JSON.parse(await vfs.readText(SETUP_READ)) };
    } catch { /* */ }
    try {
      if (vfs.exists(ALARMS_READ)) { alarms = parseAlarms(await vfs.readText(ALARMS_READ)); filename = vfs.canonical(ALARMS_READ); }
    } catch (e) { console.warn('Alarm: cannot load alarms', e); }
  }
  const choicesDir = () => (os.sysvars.get('Choices$Write') ?? 'ADFS::HardDisc4.$.!Boot.Choices') + '.Alarm';
  function ensureDir() { const d = choicesDir(); if (!vfs.exists(d)) vfs.mkdir(d, { parents: true }); return d; }
  function saveSetup() {
    try { vfs.writeFile(ensureDir() + '.Setup', JSON.stringify(setup), { filetype: 0xFFF }); } catch (e) { task.reportError(m('File03', e.message)); }
  }
  function saveDatabase() {
    try { filename = vfs.writeFile(ensureDir() + '.Alarms', serialise(), { filetype: 0xAE9 }); modified = false; updateBrowserTitle(); } catch (e) { task.reportError(m('File06', e.message)); }
  }
  function changed() {
    alarms.sort((a, b) => a.t - b.t);
    modified = true;
    if (setup.autoSave) saveDatabase();
    refreshBrowser();
  }
  const saveLS = () => { try { localStorage.setItem(LS_KEY, JSON.stringify({ clockOffset })); } catch { /* */ } };

  await loadState();

  // ------------------------------------------------------------------ date helpers
  const addUnits = (t, n, unit) => {
    const d = new Date(t);
    switch (unit) {
      case 0: d.setMinutes(d.getMinutes() + n); break;
      case 1: d.setHours(d.getHours() + n); break;
      case 2: d.setDate(d.getDate() + n); break;
      case 3: d.setDate(d.getDate() + 7 * n); break;
      case 4: d.setMonth(d.getMonth() + n); break;
      case 5: d.setFullYear(d.getFullYear() + n); break;
    }
    return d.getTime();
  };
  const fitWeek = (t) => {
    const d = new Date(t);
    if (!setup.days.some(Boolean)) return t;
    while (!setup.days[d.getDay()]) d.setDate(d.getDate() + 1);
    return d.getTime();
  };
  // Nth weekday (0 first, 1 second, 2 third, 3 last, 4 penultimate, 5 third to last) in a month
  const nthWeekday = (year, month, nth, wd, h, mi) => {
    if (nth < 3) {
      const d = new Date(year, month, 1, h, mi);
      while (d.getDay() !== wd) d.setDate(d.getDate() + 1);
      d.setDate(d.getDate() + 7 * nth);
      return d.getTime();
    }
    const d = new Date(year, month + 1, 0, h, mi);
    while (d.getDay() !== wd) d.setDate(d.getDate() - 1);
    d.setDate(d.getDate() - 7 * (nth - 3));
    return d.getTime();
  };
  /** The next occurrence of a repeating alarm after time t, or null. */
  function nextRepeat(a, after) {
    const r = a.repeat;
    if (!r) return null;
    let t = a.t;
    let guard = 0;
    if (r.mode === 'every') {
      do { t = addUnits(t, r.n, r.unit); if (a.workWeek && r.unit >= 2) t = fitWeek(t); } while (t <= after && ++guard < 100000);
    } else {
      const d0 = new Date(a.t);
      let y = d0.getFullYear(), mo = d0.getMonth();
      do { mo += r.months; t = nthWeekday(y, mo, r.nth, r.wd, d0.getHours(), d0.getMinutes()); } while (t <= after && ++guard < 10000);
    }
    return new Date(t).getFullYear() > 2247 ? null : t;
  }

  // ------------------------------------------------------------------ icon bar clock
  const area = new Map();
  let clockSeq = 0;
  let ibText = '';
  function renderClock() {
    const d = now();
    const ana = setup.display === 'ana' || setup.display === 'anasec';
    const S = 2;                                    // render at 2x for crisp text
    const c = document.createElement('canvas');
    let cssW, cssH = 34;
    const g = c.getContext('2d');
    if (ana) {
      cssW = 34;
      c.width = cssW * S; c.height = cssH * S;
      g.scale(S, S);
      const cx = 17, cy = 17, r = 15.5;
      g.fillStyle = '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); g.stroke();
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6, l = i % 3 ? 2 : 3.5;
        g.beginPath(); g.moveTo(cx + Math.sin(a) * (r - 1), cy - Math.cos(a) * (r - 1)); g.lineTo(cx + Math.sin(a) * (r - 1 - l), cy - Math.cos(a) * (r - 1 - l)); g.stroke();
      }
      const hand = (ang, len, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(ang) * len, cy - Math.cos(ang) * len); g.stroke(); };
      const s = d.getSeconds(), mi = d.getMinutes() + s / 60, h = (d.getHours() % 12) + mi / 60;
      hand(h * Math.PI / 6, 8, 2, '#000');
      hand(mi * Math.PI / 30, 12.5, 1.5, '#000');
      if (setup.display === 'anasec') hand(s * Math.PI / 30, 13, 0.8, '#dd0000');
      ibText = formatTime(m('Time01'), d);
    } else {
      const fmt = setup.display === 'hhmm' ? '%24:%mi' : setup.display === 'hhmmss' ? '%24:%mi:%se' : setup.userFormat;
      ibText = formatTime(fmt, d);
      const font = fonts.css;
      g.font = font;
      cssW = Math.max(34, Math.ceil(g.measureText(ibText).width) + 16);
      c.width = cssW * S; c.height = cssH * S;
      g.scale(S, S);
      // PROCprepare_icon (digital formats): a 2-pixel frame in Wimp colour 8 (dark blue), inside it a
      // 2-pixel frame in colour 15 (light blue), then white; red (11) and orange (14) while a user
      // alarm is set.
      const userAlarmSet = alarms.length > 0;
      g.fillStyle = userAlarmSet ? '#dd0000' : '#004499'; g.fillRect(0, 0, cssW, cssH);
      g.fillStyle = userAlarmSet ? '#ffbb00' : '#00bbff'; g.fillRect(2, 2, cssW - 4, cssH - 4);
      g.fillStyle = '#ffffff'; g.fillRect(4, 4, cssW - 8, cssH - 8);
      g.font = font; g.fillStyle = '#000'; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText(ibText, cssW / 2, cssH / 2 + 1);
    }
    const name = 'alarmclk' + (++clockSeq & 1);
    area.clear();
    area.set(name, new SpriteInfo({ name, osW: cssW * 2, osH: cssH * 2, w: c.width, h: c.height, url: c.toDataURL(), canvas: c }));
    return name;
  }
  let lastKey = '';
  function tickClock(force = false) {
    const d = now();
    const withSecs = setup.display === 'anasec' || setup.display === 'hhmmss' || (setup.display === 'user' && /%z?(se|cs)/i.test(setup.userFormat));
    const key = setup.display + setup.userFormat + (withSecs ? d.getSeconds() : '') + d.getMinutes() + d.getHours() + (alarms.length > 0);
    if (!force && key === lastKey) return;
    lastKey = key;
    const name = renderClock();
    wimp.iconbar.update(ib, { sprite: name });
  }
  const ib = task.addIconbarIcon({
    sprite: 'alarmclk0', area,
    onClick: (ev) => { if (ev.button === 'adjust') openBrowser(); else openSetAlarm(); },
    menu: () => mainMenu(),
    onDataLoad: (ev) => { loadAlarmFile(ev.files?.[0]?.path); return true; },
    help: () => m('AlarmH2'),
  });
  ib.area = area; ib.icon.area = area;
  tickClock(true);

  // ------------------------------------------------------------------ helpers for template windows
  const make = (name, over = {}) => wimp.createWindowFromTemplate(tpl, name, over, task);
  const adjDir = (ev) => (ev.button === 'adjust' ? -1 : 1);
  const centre = (w) => ({ x: Math.round((wimp.width - w.w) / 2), y: Math.round((wimp.height - w.h) / 3) });

  // ------------------------------------------------------------------ Info
  const infoWin = () => {
    const w = make('info');
    const I = w.icons;
    I[0].setText(m('TaskID')); I[1].setText(ctx.app.info.purpose); I[2].setText(ctx.app.info.author); I[3].setText(m('AlarmID'));
    w.helpText = m('AlarmH9');
    w.on('menuclosed', () => w.delete());
    return w;
  };

  // ------------------------------------------------------------------ Set / Change alarm window
  let alarmWin = null;
  function openSetAlarm(existing = null) {
    if (alarmWin) {
      if (!existing && alarmWin._mode === 'set') { alarmWin.open({ behind: 'top' }); return; }
      task.reportError(existing ? (alarmWin._mode === 'set' ? m('OkayA4') : m('OkayA2')) : (alarmWin._mode === 'set' ? m('OkayB6') : m('OkayB8')), { category: 'info' });
      alarmWin.open({ behind: 'top' });
      return;
    }
    const w = alarmWin = make('alarm', { title: existing ? m('TitlA3') : m('TitlA1') });
    w._mode = existing ? 'change' : 'set';
    const I = w.icons;
    const d = existing ? new Date(existing.t) : (() => { const x = now(); x.setSeconds(0, 0); x.setMinutes(x.getMinutes() + 1); return x; })();
    const st = {
      d, msg: existing ? [...existing.msg] : ['', '', ''], urgent: !!existing?.urgent, isTask: !!existing?.isTask,
      workWeek: existing?.workWeek ?? setup.workWeek,
      repeating: !!existing?.repeat, mode: existing?.repeat?.mode ?? 'every',
      n: existing?.repeat?.n ?? 1, unit: existing?.repeat?.unit ?? 2,
      nth: existing?.repeat?.nth ?? 0, wd: existing?.repeat?.wd ?? d.getDay(), months: existing?.repeat?.months ?? 1,
    };
    let editing = existing;
    const H_SHORT = 184, H_FULL = 336;   // visible heights (px) without / with the repeat section
    const load = (a) => {
      st.d = new Date(a.t); st.msg = [...a.msg]; st.urgent = !!a.urgent; st.isTask = !!a.isTask; st.workWeek = !!a.workWeek;
      st.repeating = !!a.repeat; if (a.repeat) Object.assign(st, { mode: a.repeat.mode, n: a.repeat.n ?? 1, unit: a.repeat.unit ?? 2, nth: a.repeat.nth ?? 0, wd: a.repeat.wd ?? 0, months: a.repeat.months ?? 1 });
      editing = a; for (let i = 0; i < 3; i++) I[16 + i].setText(st.msg[i]); show();
    };
    const show = () => {
      I[2].setText(formatTime(m('Time01'), st.d));
      I[7].setText(formatTime(m('Time02'), st.d));
      I[11].setText(formatTime(m('Time03'), st.d));
      I[14].setText(formatTime(m('Time04'), st.d));
      I[5].setState({ selected: st.urgent }); I[29].setState({ selected: st.isTask }); I[30].setState({ selected: st.workWeek });
      I[19].setState({ selected: st.repeating });
      I[32].setState({ selected: st.mode === 'every' }); I[33].setState({ selected: st.mode === 'monthly' });
      I[27].setText(String(st.n));
      for (let u = 0; u < 6; u++) I[20 + u].setState({ selected: st.unit === u });
      I[35].setText(m(`SR${st.nth}w1`)); I[38].setText(DAYS[st.wd]); I[41].setText(m(`MR${st.months}`));
      const sh = st.mode !== 'every';
      for (const i of [26, 27, 28, 20, 21, 22, 23, 24, 25]) I[i].setState({ shaded: sh });
      for (const i of [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44]) I[i].setState({ shaded: !sh });
      const h = st.repeating ? H_FULL : H_SHORT;
      if (w.isOpen && w.h !== h) w.open({ x: w.x, y: w.y, w: w.w, h, behind: 'keep' });
    };
    for (let i = 0; i < 3; i++) I[16 + i].setText(st.msg[i]);
    show();
    const bump = (field, dir) => {
      const x = st.d;
      switch (field) {
        case 'h': x.setHours(x.getHours() + dir); break;
        case 'mi': x.setMinutes(x.getMinutes() + dir); break;
        case 'dy': x.setDate(x.getDate() + dir); break;
        case 'mo': x.setMonth(x.getMonth() + dir); break;
        case 'yr': x.setFullYear(Math.min(2247, Math.max(1900, x.getFullYear() + dir))); break;
      }
      show();
    };
    const arrows = { 0: ['h', 1], 1: ['h', -1], 3: ['mi', 1], 4: ['mi', -1], 8: ['dy', 1], 6: ['dy', -1], 10: ['mo', 1], 9: ['mo', -1], 13: ['yr', 1], 12: ['yr', -1] };
    const commit = () => {
      for (let i = 0; i < 3; i++) st.msg[i] = I[16 + i].text;
      const a = editing ?? { id: nextId++ };
      a.t = st.d.getTime(); a.msg = [...st.msg]; a.urgent = st.urgent; a.isTask = st.isTask; a.workWeek = st.workWeek;
      a.repeat = st.repeating ? (st.mode === 'every' ? { mode: 'every', n: st.n, unit: st.unit } : { mode: 'monthly', nth: st.nth, wd: st.wd, months: st.months }) : null;
      if (a.repeat?.mode === 'monthly') { const d0 = new Date(a.t); a.t = nthWeekday(d0.getFullYear(), d0.getMonth(), a.repeat.nth, a.repeat.wd, d0.getHours(), d0.getMinutes()); }
      if (a.workWeek && a.repeat) a.t = fitWeek(a.t);
      if (!editing) alarms.push(a);
      a.fired = false;
      changed();
      closeAlarmWin();
    };
    const closeAlarmWin = () => { w.delete(); alarmWin = null; };
    w.on('click', (ev) => {
      if (ev.button === 'menu') { wimp.menus.openAt(findMenu(), ev, { task }); return true; }
      const i = ev.iconIndex;
      if (arrows[i]) { const [f, dir] = arrows[i]; bump(f, dir * adjDir(ev)); return true; }
      switch (i) {
        case 5: st.urgent = I[5].selected; break;
        case 29: st.isTask = I[29].selected; break;
        case 30: st.workWeek = I[30].selected; break;
        case 19: st.repeating = I[19].selected; show(); break;
        case 32: st.mode = 'every'; show(); break;
        case 33: st.mode = 'monthly'; show(); break;
        case 20: case 21: case 22: case 23: case 24: case 25: st.unit = i - 20; show(); break;
        case 28: st.n = Math.min(999, st.n + adjDir(ev)) || 1; if (st.n < 1) st.n = 999; show(); break;
        case 26: st.n = st.n - adjDir(ev); if (st.n < 1) st.n = 999; if (st.n > 999) st.n = 1; show(); break;
        case 36: st.nth = (st.nth + adjDir(ev) + 6) % 6; show(); break;
        case 34: st.nth = (st.nth - adjDir(ev) + 6) % 6; show(); break;
        case 39: st.wd = (st.wd + adjDir(ev) + 7) % 7; show(); break;
        case 37: st.wd = (st.wd - adjDir(ev) + 7) % 7; show(); break;
        case 42: st.months = ((st.months - 1 + adjDir(ev) + 12) % 12) + 1; show(); break;
        case 40: st.months = ((st.months - 1 - adjDir(ev) + 12) % 12) + 1; show(); break;
        case 31: commit(); break;
        case 2: case 7: case 11: case 14: wimp.setCaret(w, I[16]); break;
      }
      return true;
    });
    w.on('key', (ev) => {
      if (ev.code === 13 && ev.icon === I[18]) { commit(); return true; }
      if (ev.code === 13 && ev.icon) { wimp.setCaret(w, I[ev.icon.handle + 1]); return true; }
      if (ev.code === 27) { closeAlarmWin(); return true; }
      return false;
    });
    w.on('close', (ev) => { ev.preventDefault(); closeAlarmWin(); });
    w.helpText = m(existing ? 'AlarmH5' : 'AlarmH3');
    const help = { 2: 'HelpA3', 5: st.urgent ? 'HelpA7' : 'HelpA6', 7: 'HelpA9', 11: 'HelpB4', 14: 'HelpB7', 16: 'HelpB8', 17: 'HelpB8', 18: 'HelpB9', 19: 'HelpC1', 29: 'HelpE1', 30: 'HelpE3', 31: 'HelpD3', 27: 'HelpD1', 26: 'HelpC9', 28: 'HelpD2' };
    w.on('helprequest', (ev) => { const k = help[ev.icon?.handle]; if (k) ev.text = m(k); });
    // Find menu (previous / next / find), only active while changing an alarm
    const findMenu = () => new Menu(m('MenuFI').split(',')[0].slice(1), [
      { text: m('MenuFI').split(',')[1], shaded: () => !editing || alarms.indexOf(editing) <= 0, action: () => load(alarms[alarms.indexOf(editing) - 1]) },
      { text: m('MenuFI').split(',')[2], shaded: () => !editing || alarms.indexOf(editing) >= alarms.length - 1, action: () => load(alarms[alarms.indexOf(editing) + 1]) },
      { text: m('MenuFI').split(',')[3], shaded: () => !editing, action: () => openClock('find', (t) => { const a = alarms.find((x) => x.t >= t); if (a) load(a); else wimp.beep(); }) },
    ]);
    const p = centre({ w: w.w, h: H_FULL });
    w.open({ x: p.x, y: p.y, h: st.repeating ? H_FULL : H_SHORT, behind: 'top' });
    wimp.setCaret(w, I[16]);
  }

  // ------------------------------------------------------------------ Set clock / Find alarm
  let clockWin = null;
  function openClock(kind = 'clock', onFind = null) {
    clockWin?.delete();
    const w = clockWin = make('clock', { title: kind === 'find' ? m('TitlA5') : m('TitlA4') });
    const I = w.icons;
    const d = now();
    if (kind === 'clock') d.setSeconds(0, 0);
    I[5].setText(kind === 'find' ? m('IconA5') : m('IconA4'));
    if (kind === 'find') I[15].setState({ deleted: true });
    else { I[15].setText(/BST/.test(formatTime('%tz', d)) ? 'BST' : 'GMT'); I[15].setState({ selected: setup.bst }); }
    const show = () => {
      I[2].setText(formatTime(m('Time01'), d)); I[7].setText(formatTime(m('Time02'), d));
      I[11].setText(formatTime(m('Time03'), d)); I[14].setText(formatTime(m('Time04'), d));
    };
    show();
    const arrows = { 0: (s) => d.setHours(d.getHours() + s), 1: (s) => d.setHours(d.getHours() - s), 3: (s) => d.setMinutes(d.getMinutes() + s), 4: (s) => d.setMinutes(d.getMinutes() - s),
      8: (s) => d.setDate(d.getDate() + s), 6: (s) => d.setDate(d.getDate() - s), 10: (s) => d.setMonth(d.getMonth() + s), 9: (s) => d.setMonth(d.getMonth() - s),
      13: (s) => d.setFullYear(d.getFullYear() + s), 12: (s) => d.setFullYear(d.getFullYear() - s) };
    const go = () => {
      if (kind === 'find') onFind?.(d.getTime());
      else { clockOffset = d.getTime() - Date.now(); setup.bst = I[15].selected; saveLS(); saveSetup(); tickClock(true); }
      w.delete(); clockWin = null;
    };
    w.on('click', (ev) => {
      if (ev.button === 'menu') return true;
      if (arrows[ev.iconIndex]) { arrows[ev.iconIndex](adjDir(ev)); show(); return true; }
      if (ev.iconIndex === 5) go();
      return true;
    });
    w.on('key', (ev) => { if (ev.code === 13) { go(); return true; } return false; });
    w.on('close', (ev) => { ev.preventDefault(); w.delete(); clockWin = null; });
    const hk = { 2: kind === 'find' ? 'FindA1' : 'ClockA1', 5: kind === 'find' ? 'FindA2' : 'ClockA2', 7: kind === 'find' ? 'FindA3' : 'ClockA3', 11: kind === 'find' ? 'FindA4' : 'ClockA4', 14: kind === 'find' ? 'FindA5' : 'ClockA5', 0: 'ClockA7', 1: 'ClockA8', 3: 'ClockA9', 4: 'ClockB1', 6: 'ClockB2', 8: 'ClockB3', 9: 'ClockB4', 10: 'ClockB5', 12: 'ClockB6', 13: 'ClockB7', 15: I[15].selected ? 'ClockB9' : 'ClockB8' };
    w.on('helprequest', (ev) => { const k = hk[ev.icon?.handle]; if (k) ev.text = m(k); });
    w.helpText = m(kind === 'find' ? 'AlarmH7' : 'AlarmH6');
    const p = centre(w);
    w.open({ ...p, h: 64, behind: 'top' });
    wimp.setCaret(w);
  }

  // ------------------------------------------------------------------ Setup
  let setupWin = null;
  function openSetup() {
    if (setupWin) { setupWin.open({ behind: 'top' }); return; }
    const w = setupWin = make('setup');
    w.icons[28].moveTo({ ...w.icons[28].bbox, x1: w.icons[28].bbox.x1 + 20 });
    const I = w.icons;
    const s = JSON.parse(JSON.stringify(setup));
    const dispIcons = { anasec: 25, ana: 26, hhmm: 27, hhmmss: 28, user: 29 };
    const tzA = formatTime('%tz', new Date(new Date().getFullYear(), 0, 1)) === 'BST' ? 'BST' : 'GMT';
    I[3].setText(m('TZSwtch', 'GMT', 'BST').replace(/:$/, ':'));
    const show = () => {
      I[0].setState({ selected: s.silent }); I[1].setState({ selected: s.workWeek });
      for (let i = 0; i < 7; i++) I[31 + i].setState({ selected: s.days[i], shaded: !s.workWeek });
      I[38].setState({ selected: s.continuous }); I[39].setState({ selected: !s.continuous });
      I[2].setText(String(s.beepSecs)); I[2].setState({ shaded: s.continuous }); I[40].setState({ shaded: s.continuous });
      I[19].setState({ selected: s.autoSave }); I[23].setState({ selected: s.confirm });
      for (const [k, i] of Object.entries(dispIcons)) I[i].setState({ selected: s.display === k });
      I[30].setText(s.userFormat); I[30].setState({ shaded: s.display !== 'user' });
      I[3].setState({ selected: s.bst });
      const shade = !s.bst;
      for (let i = 4; i <= 17; i++) if (i !== 18) I[i]?.setState({ shaded: shade });
      for (const i of [20, 21, 22, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53]) I[i].setState({ shaded: shade });
    };
    // BST dates (informational): last Sunday in March / October
    const y = now().getFullYear();
    const bstOn = new Date(nthWeekday(y, 2, 3, 0, 1, 0)), bstOff = new Date(nthWeekday(y, 9, 3, 0, 1, 0));
    I[6].setText(formatTime('%w3, %zdy%st', bstOn)); I[9].setText('March'); I[48].setText(String(y)); I[22].setText(formatTime('%z12:%mi %am', bstOn));
    I[13].setText(formatTime('%w3, %zdy%st', bstOff)); I[16].setText('October'); I[52].setText(String(y)); I[45].setText(formatTime('%z12:%mi %am', bstOff));
    show();
    w.on('click', (ev) => {
      if (ev.button === 'menu') return true;
      const i = ev.iconIndex;
      if (i === 0) s.silent = I[0].selected;
      else if (i === 1) s.workWeek = I[1].selected;
      else if (i >= 31 && i <= 37) {
        s.days[i - 31] = I[i].selected;
        if (!s.days.some(Boolean)) { s.days[i - 31] = true; task.reportError(m('OkayC9'), { category: 'info' }); }
      } else if (i === 38) s.continuous = true;
      else if (i === 39) s.continuous = false;
      else if (i === 19) s.autoSave = I[19].selected;
      else if (i === 23) s.confirm = I[23].selected;
      else if (i === 3) s.bst = I[3].selected;
      else if (Object.values(dispIcons).includes(i)) { s.display = Object.keys(dispIcons).find((k) => dispIcons[k] === i); if (s.display === 'user') wimp.setCaret(w, I[30]); }
      else if (i === 18) { apply(); return true; }
      else return true;
      show();
      return true;
    });
    const apply = () => {
      s.beepSecs = Math.max(1, parseInt(I[2].text, 10) || 10);
      s.userFormat = I[30].text || DEFAULT_SETUP.userFormat;
      if (s.display === 'user') {
        const out = formatTime(s.userFormat, now());
        if (!out.trim()) { task.reportError(m('FrmtA3')); return; }
        if (/%[a-z0-9]{0,2}/i.test(out)) { task.reportError(m('FrmtA4')); return; }
        if (out.length > 30) { task.reportError(m('FrmtA2')); return; }
      }
      const wasAuto = setup.autoSave;
      setup = s;
      saveSetup();
      if (setup.autoSave && !wasAuto && modified) saveDatabase();
      tickClock(true);
      w.delete(); setupWin = null;
    };
    w.on('key', (ev) => { if (ev.code === 13) { apply(); return true; } return false; });
    w.on('close', (ev) => { ev.preventDefault(); w.delete(); setupWin = null; });
    const hs = { 0: s.silent ? 'SHlp0B' : 'SHlp0A', 1: 'SHlp1A', 19: 'SHlp2A', 23: 'SHlp3A', 25: 'SHlp4A', 26: 'SHlp5A', 27: 'SHlp6A', 28: 'SHlp7A', 29: 'SHlp8A', 3: 'SHlp9A', 2: 'SHlpAA', 30: 'SHlpBA', 38: 'SHlpGA', 39: 'SHlpGB', 18: 'SHlpIA' };
    w.on('helprequest', (ev) => { const i = ev.icon?.handle; if (i >= 31 && i <= 37) ev.text = m(I[i].selected ? 'SHlpHA' : 'SHlpHB'); else if (hs[i]) ev.text = m(hs[i]); });
    w.helpText = m('AlarmHB');
    const p = centre(w);
    w.open({ x: p.x, y: Math.max(20, p.y - 60), behind: 'top' });
  }

  // ------------------------------------------------------------------ Alarm browser
  let browser = null, header = null;
  const ROW = 24, TOP = 26;       // px: 48 OS rows below a 52 OS header
  const selected = new Set();
  const updateBrowserTitle = () => browser?.setTitle(filename ?? '<untitled>');
  function rowText(a) {
    const d = new Date(a.t);
    return {
      day: formatTime(m('BrwsA2', ''), d),
      date: formatTime(m('BrwsA3', ''), d),
      time: formatTime(m('BrwsA4', ''), d),
      msg: a.isTask ? m('BrwsA1', a.msg.join(' ').trim()) : (a.msg.find((x) => x.trim()) ?? m('PrntB7')),
    };
  }
  function refreshBrowser() {
    if (!browser) return;
    const H = Math.max(TOP + alarms.length * ROW + 8, 194);
    browser.setExtent({ w: 640, h: Math.max(H, 512) });
    const rows = browser._rows;
    rows.replaceChildren();
    alarms.forEach((a, i) => {
      const t = rowText(a);
      const r = document.createElement('div');
      r.className = 'alarm-row';
      const sel = selected.has(a);
      Object.assign(r.style, { position: 'absolute', left: '0', top: TOP + i * ROW + 'px', height: ROW + 'px', width: '640px', font: fonts.css, whiteSpace: 'pre', lineHeight: ROW + 'px' });
      const cell = (txt, x0, x1, right = false) => {
        const c = document.createElement('span');
        Object.assign(c.style, { position: 'absolute', left: x0 + 'px', width: (x1 - x0) + 'px', textAlign: right ? 'right' : 'left', overflow: 'hidden', padding: '0 2px', boxSizing: 'border-box', background: sel ? '#000' : 'transparent', color: sel ? '#fff' : '#000' });
        c.textContent = txt;
        r.appendChild(c);
      };
      cell(t.day, 2, 42); cell(t.date, 42, 158, true); cell(t.time, 161, 231, true); cell(t.msg, 233, 636);
      rows.appendChild(r);
    });
  }
  const rowAt = (y) => { const i = Math.floor((y - TOP) / ROW); return i >= 0 && i < alarms.length ? alarms[i] : null; };
  function openBrowser() {
    if (browser) { browser.open({ behind: 'top' }); header?.open?.({ behind: 'top' }); return; }
    const w = browser = make('browser', { title: filename ?? '<untitled>' });
    for (const ic of w.icons) ic?.setState({ deleted: true });
    w._rows = document.createElement('div');
    w.work.appendChild(w._rows);
    header = make('browse1');
    for (const ic of header.icons) if (ic) ic.moveTo({ ...ic.bbox, x1: ic.bbox.x0 + 100 });
    w.attachPane(header, { dx: 0, dy: 0, h: 26, fitWidth: true });
    w.on('click', (ev) => {
      if (ev.button === 'menu') { wimp.menus.openAt(browserMenu(rowAt(ev.y)), ev, { task }); return true; }
      const a = rowAt(ev.y);
      if (ev.button === 'select') { if (!a || !selected.has(a)) selected.clear(); if (a) selected.add(a); }
      else if (a) { if (selected.has(a)) selected.delete(a); else selected.add(a); }
      refreshBrowser();
      return true;
    });
    w.on('doubleclick', (ev) => { const a = rowAt(ev.y); if (a && ev.button === 'select') openSetAlarm(a); return true; });
    w.on('close', (ev) => { ev.preventDefault(); w.close(); });
    w.helpText = m('AlarmHA');
    refreshBrowser();
    w.open({ x: 120, y: 120, w: 640, h: 194, behind: 'top' });
  }
  function deleteSelected() {
    const doIt = () => { alarms = alarms.filter((a) => !selected.has(a)); selected.clear(); changed(); };
    if (!setup.confirm) { doIt(); return; }
    const w = make('deleting');
    w.icons[3].setText(selected.size > 1 ? m('BrwsT4') : m('BrwsT3'));
    w.icons[3].setText((selected.size > 1 ? m('BrwsT4') : m('BrwsT3')).replace('`ss', 'the selected alarms').replace('`s', 'the selected alarm'));
    w.on('click', (ev) => { if (ev.iconIndex === 1) { doIt(); w.delete(); } else if (ev.iconIndex === 2) w.delete(); return true; });
    w.on('close', (ev) => { ev.preventDefault(); w.delete(); });
    w.open({ ...centre(w), behind: 'top' });
  }
  const textListing = (list) => list.map((a) => {
    const d = new Date(a.t);
    const out = [formatTime(m('PrntA6'), d) + '  ' + formatTime(m('PrntA7'), d)];
    if (a.isTask) out.push(m('PrntA2'));
    for (const l of a.msg) if (l.trim()) out.push('  ' + l);
    if (!a.isTask && !a.msg.some((l) => l.trim())) out.push('  ' + m('PrntB7'));
    if (a.urgent) out.push(m('PrntA3'));
    if (a.repeat?.mode === 'every') out.push(m(a.workWeek ? 'PrntA4' : 'PrntA5', a.repeat.n, m('PrntB' + (a.repeat.unit + 1))));
    if (a.repeat?.mode === 'monthly') out.push(m('PrntB9', m(`SR${a.repeat.nth}w1`), DAYS[a.repeat.wd], m(`MR${a.repeat.months}`)));
    return out.join('\n');
  }).join('\n\n') + '\n';
  const saveBox = (kind, list) => saveAs({
    task, filename: kind === 'text' ? 'AlarmList' : 'Alarms', filetype: kind === 'text' ? 0xFFF : 0xAE9,
    getData: async () => (kind === 'text' ? textListing(list()) : 'ALRM' + JSON.stringify({ version: 1, alarms: list().map(({ id, ...a }) => a) }) + '\n'),
  });
  function browserMenu(under) {
    if (under && !selected.has(under) && selected.size === 0) { selected.add(under); refreshBrowser(); }
    const items1 = m('BrwsM1').split(','), items2 = m('BrwsM2').split(',');
    const one = selected.size === 1;
    const noun = one ? m('BrwsM6') : m('BrwsM4');
    const sel = () => alarms.filter((a) => selected.has(a));
    const selMenu = new Menu(items2[0].slice(1).replace('%0', one ? m('BrwsM5') : m('BrwsM3')), [
      { text: items2[1].replace('%1', noun), action: () => { const a = sel()[0]; if (a) openSetAlarm(a); } },
      { text: items2[2].replace('%1', noun), action: deleteSelected },
      { text: items2[3].replace('%1', noun), action: () => { for (const a of sel()) alarms.push({ ...JSON.parse(JSON.stringify(a)), id: nextId++ }); changed(); } },
      { text: items2[4].replace('@', ''), submenu: () => saveBox('text', sel) },
      { text: items2[5].replace('@', ''), submenu: () => saveBox('alarms', sel) },
    ]);
    return new Menu(items1[0].slice(1), [
      { text: items1[1], action: () => openSetAlarm() },
      { text: one ? m('BrwsM5') : m('BrwsM3'), submenu: selMenu, shaded: () => selected.size === 0 },
      { text: items1[3], action: () => { alarms.forEach((a) => selected.add(a)); refreshBrowser(); } },
      { text: items1[4], action: () => { selected.clear(); refreshBrowser(); } },
      { text: items1[5].replace('@', ''), submenu: () => saveBox('text', () => alarms) },
      { text: items1[6].replace('@', ''), submenu: () => saveBox('alarms', () => alarms) },
    ]);
  }

  // ------------------------------------------------------------------ loading alarm files
  async function loadAlarmFile(path) {
    if (!path) return;
    try {
      const list = parseAlarms(await vfs.readText(path));
      alarms.push(...list);
      changed();
      openBrowser();
    } catch (e) { task.reportError(m('OkayA3', vfs.leaf(path))); }
  }
  task.onMessage('DataOpen', (msg) => { if (msg.filetype === 0xAE9) { loadAlarmFile(msg.path); return true; } });
  task.onMessage('DataLoad', (msg) => { const f = msg.files?.[0]; if (f?.filetype === 0xAE9) { loadAlarmFile(f.path); return true; } });

  // ------------------------------------------------------------------ alarms going off
  const ringing = new Map();     // alarm -> {win, stopBeep}
  function goOff(a) {
    a.fired = true;
    if (a.isTask) {
      const cmd = a.msg.map((x) => x.trim()).filter(Boolean).join(' ');
      os.cli.run(cmd).catch((e) => task.reportError(e.message ?? String(e)));
      reschedule(a, false);
      return;
    }
    const w = make('message', { title: a.urgent ? m('ActvA3') : m('ActvA4') });
    const I = w.icons;
    const d = new Date(a.t);
    const lines = [formatTime(m('ActvA1'), d), formatTime(m('ActvA6'), d), ''];
    const next = nextRepeat(a, Math.max(a.t, now().getTime()));
    if (a.repeat && next) { const nd = new Date(next); lines.push(formatTime(m('ActvA2'), nd), formatTime(m('ActvA6'), nd), ''); }
    lines.push(...a.msg);
    while (lines.length > 3 && !lines[lines.length - 1].trim()) lines.pop();
    for (let i = 0; i < 9; i++) { I[i].setText(lines[i] ?? ''); I[i].setState({ deleted: i >= lines.length }); }
    const h = (lines.length * 40 + 8) / 2;
    // beeping
    let stop = () => {};
    if (a.urgent || !setup.silent) {
      wimp.beep();
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (!setup.continuous && !a.urgent && Date.now() - t0 > setup.beepSecs * 1000) { clearInterval(iv); return; }
        wimp.beep();
      }, 1000);
      stop = () => clearInterval(iv);
      task.timers.add(stop);
    }
    ringing.set(a, { win: w, stop });
    const finish = (how, n, unit) => {
      stop(); ringing.delete(a); w.delete();
      if (how === 'accept') reschedule(a, false);
      else if (how === 'cancel') { alarms = alarms.filter((x) => x !== a); changed(); }
      else if (how === 'defer') {
        const t = addUnits(now().getTime(), n, unit);
        if (new Date(t).getFullYear() > 2247) { task.reportError(m('OkayC4').replace('`2', m('`2'))); return; }
        a.t = t; a.fired = false; changed();
      }
    };
    const menuAL = m('MenuAL').split(','), menuD2 = m('MenuD2').split(',');
    const howMany = (unit) => new Menu(m('MenuD1').split(',')[0].slice(1), [
      { text: '', writable: { value: '', maxLen: 4, validation: 'A0-9' }, action: (ev) => { const n = parseInt(ev.value, 10); if (n > 0) finish('defer', n, unit); }, help: m('MnuD11') },
    ]);
    const menu = () => new Menu(menuAL[0].slice(1), [
      { text: menuAL[1], action: () => finish('accept'), help: m('MnuAL1') },
      { text: menuAL[2], action: () => finish('cancel'), help: m('MnuAL2') },
      { text: menuAL[3], help: m('MnuAL3'), submenu: new Menu(menuD2[0].slice(1), menuD2.slice(1).map((t, u) => ({ text: t, submenu: howMany(u), help: m('MnuD2' + (u + 1)) }))) },
    ]);
    w.menu = menu;
    w.on('click', (ev) => { if (ev.button === 'select') stop(); });
    w.on('close', (ev) => { ev.preventDefault(); finish('accept'); });
    w.helpText = m('AlarmH8');
    w.open({ ...centre({ w: w.w, h }), h, behind: 'top' });
  }
  function reschedule(a) {
    const next = nextRepeat(a, now().getTime());
    if (a.repeat && next) { a.t = next; a.fired = false; }
    else if (a.repeat && !next) { alarms = alarms.filter((x) => x !== a); task.reportError(m(a.isTask ? 'OkayC6' : 'OkayC7').replace('`2', m('`2'))); }
    else alarms = alarms.filter((x) => x !== a);
    changed();
  }
  function checkAlarms() {
    const t = now().getTime();
    for (const a of [...alarms]) if (!a.fired && !ringing.has(a) && a.t <= t) goOff(a);
  }

  // ------------------------------------------------------------------ main menu
  function mainMenu() {
    const it = m('MenuMM').split(',');
    return new Menu(it[0].slice(1), [
      { text: it[1], submenu: infoWin, help: m('MnuMM1') },
      { text: it[2], action: openBrowser, help: m('MnuMM3') },
      { text: it[3], action: openSetup, help: m('MnuMM4') },
      { text: it[4], action: () => openClock('clock'), help: m('MnuMM5') },
      { text: it[5], action: () => quit(), help: m('MnuMM6') },
    ]);
  }

  async function quit() {
    if (modified && !setup.autoSave) {
      const w = make('warning');
      const r = await new Promise((res) => {
        w.on('click', (ev) => { if ([1, 2, 3].includes(ev.iconIndex)) res(ev.iconIndex); return true; });
        w.on('close', (ev) => { ev.preventDefault(); res(1); });
        w.open({ ...centre(w), behind: 'top' });
      });
      w.delete();
      if (r === 1) return false;
      if (r === 3) saveDatabase();
    }
    task.quit();
    return true;
  }
  task.onMessage('PreQuit', (msg) => { if (modified && !setup.autoSave) { msg.object?.(); quit(); } });
  task.onMessage('Quit', () => task.quit());
  task.on('run', () => openSetAlarm());

  // "null events": clock and alarms
  task.every(250, () => { tickClock(); checkAlarms(); });
  checkAlarms();

  // test hook
  task.alarm = { get alarms() { return alarms; }, get setup() { return setup; }, openSetAlarm, openBrowser, openSetup, openClock, goOff, checkAlarms };
}
