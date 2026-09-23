// !Maestro 2.13 (RISC OS 3.71 hard disc) re-implemented in JavaScript.
//
// Score window ("ScoreWind") with the note / rest palette panes along the top ("NotesPane",
// "RestsPane") and the accidentals / dots / tie / bar / clef / key / time pane along the bottom
// ("SharpsPane"), all from the real Templates and Sprites22. Menu (from the !RunImage DATA):
// Save ▸, File ▸, Print ▸, Clear, Staves ▸, Instruments ▸, Volume ▸, Tempo ▸, Time sig. ▸,
// Key sig. ▸, Goto ▸, Play. Files are the real Maestro format (format.js); playback is Web Audio
// (synth.js). Score layout / drawing follows the original's geometry (score.js).

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { loadMessages } from '../../core/messages.js';
import { loadTemplates } from '../../core/templates.js';
import { saveAs, infoBox, query } from '../../core/dialogs.js';
import { os } from '../../core/os.js';
import { parseMaestro, saveMaestro, emptyScore, perform, channelStaves, VOLUME_NAMES, TEMPO_NAMES, STEREO_KEYS, VOLUME_AMP, MaestroError } from './format.js';
import { staveLayout, layoutColumns, drawScore, lowBit, GEOM } from './score.js';
import { Player, VOICES, setMasterVolume, audio } from './synth.js';

const PANE_H = 40;                // px (80 OS)
const TOPY = 20;                  // px: score.js draws OS y=0 at 20px
const MAJOR = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'Fs', 'Cs'];
const MINOR = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'Fs', 'Cs', 'Gs', 'Ds', 'As'];
const keyOf = (i) => (i < 7 ? { count: 7 - i, flats: 1 } : { count: i - 7, flats: 0 });   // menu index -> key
const DENOMS = [1, 2, 4, 8, 16, 32, 64];

let sysFont = null;

export default async function start(task, ctx) {
  const [M, tpl, area] = await Promise.all([
    loadMessages('Maestro'), loadTemplates('assets/templates/Maestro.json'), os.sprites.loadManifest('Maestro', 'Sprites22'),
  ]);
  const m = (t, ...a) => M.lookup(t, ...a);
  const vfs = os.vfs;
  os.sysvars.set('Maestro$Running', 'Yes');
  task.on('quit', () => { player.stop(); os.sysvars.unset?.('Maestro$Running') ?? os.sysvars.set('Maestro$Running', ''); });

  // sprites as canvases for the score renderer
  const sprCache = new Map();
  await Promise.all([...area.values()].map(async (s) => { try { sprCache.set(s.name, { img: await s.canvas(), w: s.cssW, h: s.cssH }); } catch { /* */ } }));
  const spr = (n) => sprCache.get(n);
  // system font text (time signatures, bar numbers)
  if (!sysFont) sysFont = await (await fetch('assets/fonts/system8x8.json')).json();
  const text = (g, str, x, y) => {
    g.fillStyle = '#000';
    for (let i = 0; i < str.length; i++) {
      const rows = sysFont.chars[str.charCodeAt(i)] ?? [];
      for (let r = 0; r < 8; r++) for (let b = 0; b < 8; b++) if (rows[r] & (0x80 >> b)) g.fillRect(Math.round(x) + i * 8 + b, Math.round(y) + r * 2, 1, 2);
    }
  };

  // ------------------------------------------------------------------ document state
  let doc = emptyScore();
  let filename = null;
  let modified = false;
  let L = staveLayout(doc), cols = layoutColumns(doc);
  let itemCol = [];
  let sel = null;                   // {pane: 'note'|'rest'|'sharp', i}
  let timeSig = { beats: 4, denom: 2 };   // denom index into DENOMS
  let keySel = { minor: false, i: 7 };
  let volume = 6;                   // overall volume (Sound_Volume) index
  const player = new Player();
  let playMarker = null;            // column index while playing

  const relayout = () => {
    L = staveLayout(doc);
    cols = layoutColumns(doc);
    itemCol = [];
    cols.forEach((c, ci) => c.items.forEach((i) => { itemCol[i] = ci; }));
    if (!score) return;
    const last = cols[cols.length - 1];
    const w = Math.max(640, Math.ceil((last.x + last.w) / 2) + 200);
    const h = Math.ceil(L.Uc / 2) + TOPY + PANE_H + 8;
    score.setExtent({ w, h });
    score.invalidate();
  };
  const setModified = (v) => { modified = v; score?.setTitle((filename ?? m('Untitled')) + (v ? ' *' : '')); };

  // ------------------------------------------------------------------ windows
  let score = null;
  const panes = {};
  function openScore() {
    if (score) { score.open({ behind: 'top' }); return; }
    score = wimp.createWindowFromTemplate(tpl, 'ScoreWind', { title: filename ?? m('Untitled'), spriteArea: area }, task);
    score.useCanvas((g, rect) => {
      g.imageSmoothingEnabled = false;
      const last = cols[cols.length - 1];
      drawScore(g, doc, L, cols, spr, text, rect, Math.max(rect.x1, Math.ceil((last.x + last.w) / 2) + 16));
      if (playMarker != null && cols[playMarker]) {
        const x = Math.round(cols[playMarker].x / 2 + 2);
        g.fillStyle = '#dd0000';
        g.fillRect(x, TOPY + PANE_H - 10, 2, Math.ceil(L.Uc / 2) - 10);
      }
    });
    for (const [key, name] of [['note', 'NotesPane'], ['rest', 'RestsPane'], ['sharp', 'SharpsPane']]) {
      const p = panes[key] = wimp.createWindowFromTemplate(tpl, name, { spriteArea: area }, task);
      p.icons.forEach((ic, i) => {
        if (!ic) return;
        if (key === 'note' && i === 8) { ic.setState({ deleted: true }); return; }
        ic.help = null;
      });
      p.on('click', (ev) => {
        if (ev.button === 'menu') { wimp.menus.openAt(scoreMenu(), ev, { task }); return true; }
        if (ev.iconIndex < 0) return true;
        const same = sel && sel.pane === key && sel.i === ev.iconIndex;
        selectPalette(same ? null : { pane: key, i: ev.iconIndex });
        return true;
      });
      p.on('helprequest', (ev) => { ev.text = paletteHelp(key, ev.icon?.handle); });
    }
    // bottom pane follows the bottom edge of the score window
    let bottom = null;
    const fixBottom = () => { if (bottom) bottom.dy = score.h - PANE_H; };
    score.on('opened', fixBottom); score.on('moved', fixBottom);
    score.attachPane(panes.note, { dx: 0, dy: 0, w: 221, h: PANE_H });
    score.attachPane(panes.rest, { dx: 222, dy: 0, h: PANE_H, fitWidth: true });
    score.attachPane(panes.sharp, { dx: 0, dy: 0, h: PANE_H, fitWidth: true });
    bottom = score._panes[score._panes.length - 1];
    score.on('click', (ev) => {
      if (ev.button === 'menu') { wimp.menus.openAt(scoreMenu(), ev, { task }); return true; }
      place(ev);
      return true;
    });
    score.on('close', async (ev) => {
      ev.preventDefault();
      if (modified && !(await confirmDiscard('close'))) return;
      player.stop(); playMarker = null;
      score.close();
    });
    score.on('dataload', (ev) => { loadFile(ev.files?.[0]?.path); return true; });
    score.on('helprequest', (ev) => { ev.text = m(sel ? 'ScoreHelp0' : 'ScoreHelp1'); });
    relayout();
    setModified(modified);
    const h = Math.min(wimp.height - 120, Math.ceil(L.Uc / 2) + TOPY + PANE_H + 8);
    score.open({ x: 100, y: 110, w: 680, h, behind: 'top' });
  }
  function selectPalette(s) {
    // highlighted like the original: the icon inverted (black background, white symbol)
    const hl = (x, on) => { const ic = x && panes[x.pane]?.icons[x.i]; if (ic?.el) ic.el.style.filter = on ? 'invert(1)' : ''; };
    hl(sel, false);
    sel = s;
    hl(sel, true);
  }
  const NOTE_NAMES = ['Breve', 'Semibreve', 'Minim', 'Crochet', 'Quaver', 'Semiquaver', 'Demisemiquaver', 'Hemidemisemiquaver'];
  const SHARP_NAMES = ['Natural', 'Sharp', 'Flat', 'DoubleSharp', 'DoubleFlat', 'NaturalisedSharp', 'NaturalisedFlat', 'Dot', 'DoubleDot', 'TripleDot', 'Tie', 'BarLine', 'TrebleClef', 'BassClef', 'KeySignature', 'TimeSignature'];
  const paletteHelp = (key, i) => {
    if (i == null || i < 0) return null;
    const n = key === 'note' ? NOTE_NAMES[i] : key === 'rest' ? NOTE_NAMES[i] + 'Rest' : SHARP_NAMES[i];
    return n ? m('SelectNote', m(n)) : null;
  };

  // ------------------------------------------------------------------ editing
  function hitStave(osy) {
    let best = null;
    for (let S = 0; S < L.count; S++) {
      const d = Math.abs(osy - L.b[S]);
      if (d < 3 * GEOM.OD / 2 && (!best || d < best.d)) best = { S, d };
    }
    return best?.S ?? null;
  }
  function place(ev) {
    const osx = ev.x * 2, osy = (TOPY - ev.y) * 2;
    const S = hitStave(osy);
    if (S == null) return;
    const line = Math.max(-15, Math.min(15, Math.round((osy - L.b[S]) / GEOM.PD)));
    // column under the pointer
    let ci = 0;
    for (let k = 0; k < cols.length; k++) if (cols[k].x - 12 <= osx) ci = k;
    const col = cols[ci];
    const onCol = col && osx <= col.x + Math.max(col.w, 16) + 6;
    const gate = onCol && col.type === 0 ? doc.items[col.items[0]] : null;
    const stv = channelStaves(doc.staves, doc.perc);
    const nearestNote = () => {
      if (!gate) return null;
      let best = null;
      for (const n of gate.notes) {
        if (stv[n.ch] !== S) continue;
        const l = n.a & 248 ? (n.a >> 3) - 16 : 0;
        const d = Math.abs(l - line);
        if (!best || d < best.d) best = { n, d };
      }
      return best && best.d <= 2 ? best.n : null;
    };
    const insertAt = col && col.items.length ? col.items[col.items.length - 1] + 1 : 0;
    const insert = (item) => { doc.items.splice(insertAt, 0, item); };
    const done = () => { setModified(true); relayout(); };

    if (ev.button === 'adjust') {
      // ADJUST removes the item under the pointer
      if (gate) {
        const n = nearestNote();
        if (!n) return;
        gate.notes.splice(gate.notes.indexOf(n), 1);
        if (!gate.notes.length) doc.items.splice(col.items[0], 1);
      } else if (onCol && col.type && col.items.length) {
        doc.items.splice(col.items[col.items.length - 1], 1);
      } else return;
      done();
      return;
    }
    if (!sel) { wimp.beep(); return; }
    if (sel.pane === 'note' || sel.pane === 'rest') {
      const isRest = sel.pane === 'rest' || S > doc.staves && false;
      const a = isRest ? 0 : (((line + 16) << 3) | (line > 0 ? 1 : 0));
      const note = { a, b: sel.i << 5 };
      const target = gate ?? { t: 'gate', notes: [] };
      const used = new Set(target.notes.map((n) => n.ch));
      let ch = -1;
      for (let c = 0; c < 8; c++) if (stv[c] === S && !used.has(c)) { ch = c; break; }
      if (ch < 0) { wimp.beep(); return; }
      target.notes.push({ ch, ...note });
      if (!gate) insert(target);
      playOne(ch, note, S);
      done();
      return;
    }
    // sharps pane
    const i = sel.i;
    if (i <= 10) {
      const n = nearestNote();
      if (!n) { wimp.beep(); return; }
      if (i <= 6) { const acc = i + 1; n.b = (n.b & ~7) | ((n.b & 7) === acc ? 0 : acc); }
      else if (i <= 9) { const d = i - 6; n.b = (n.b & ~24) | (((n.b >> 3) & 3) === d ? 0 : d << 3); }
      else n.a ^= 4;
      done();
      return;
    }
    if (i === 11) insert({ t: 'cmd', v: 0x20 });
    else if (i === 12 || i === 13) { if (S > doc.staves) { wimp.beep(); return; } insert({ t: 'cmd', v: 4 | ((i === 12 ? 0 : 3) << 3) | (S << 6) }); }
    else if (i === 14) { const k = keyOf(keySel.i - (keySel.minor ? 0 : 0)); insert({ t: 'cmd', v: 2 | (k.flats << 2) | (k.count << 3) }); }
    else if (i === 15) insert({ t: 'cmd', v: 1 | ((timeSig.beats - 1) << 1) | ((timeSig.denom + 1) << 5) });
    done();
  }
  // hear a note as it's placed
  function playOne(ch, note, S) {
    try {
      const probe = { ...doc, items: [...doc.items.filter((it) => it.t === 'cmd' && !(it.v & 0x20)), { t: 'gate', notes: [{ ch, ...note }] }] };
      const ev = perform(probe).events.filter((e) => e.ch === ch);
      if (ev.length) new Player().play([{ ...ev[0], time: 0, dur: Math.min(ev[0].dur, 0.6) }]);
    } catch { /* */ }
  }

  // ------------------------------------------------------------------ files
  async function loadFile(path) {
    if (!path) return;
    let bytes;
    try { bytes = await vfs.readFile(path); } catch (e) { task.reportError(m('BadFile')); return; }
    try {
      const d = parseMaestro(bytes);
      if (modified && !(await confirmDiscard('load'))) return;
      player.stop(); playMarker = null;
      doc = d; filename = vfs.canonical(path); selectPalette(null);
      openScore();
      relayout(); setModified(false);
      score.scrollTo(0, 0);
    } catch (e) {
      task.reportError(e instanceof MaestroError ? m('NotMusic', vfs.leaf(path)) : e.message);
    }
  }
  async function confirmDiscard(kind) {
    if (kind === 'close' || kind === 'load' || kind === 'clear') {
      const w = wimp.createWindowFromTemplate(tpl, 'close', {}, task);
      const r = await new Promise((res) => {
        w.on('click', (ev) => { if (ev.button !== 'menu' && [0, 2, 3].includes(ev.iconIndex)) res(ev.iconIndex); return true; });
        w.on('close', (ev) => { ev.preventDefault(); res(3); });
        w.on('key', (ev) => { if (ev.code === 27) res(3); return true; });
        w.open({ x: Math.round((wimp.width - w.w) / 2), y: Math.round((wimp.height - w.h) / 2), behind: 'top' });
        wimp.setCaret(w);
      });
      w.delete();
      if (r === 3) return false;
      if (r === 0) { wimp.menus.open(saveBox(), Math.round(wimp.width / 2 - 70), Math.round(wimp.height / 2 - 40), { task }); return false; }
      return true;
    }
    const r = await query({ task, title: m('Maestro'), message: m('Unsaved'), buttons: ['Discard', 'Cancel'] });
    return r === 'Discard';
  }
  const saveBox = () => saveAs({
    task, title: m('Save'), filename: filename ?? m('MusicFile'), filetype: 0xAF1,
    getData: async () => saveMaestro(doc),
    onSaved: (path) => { if (path) filename = path; setModified(false); },
  });
  const fileInfo = () => {
    const w = wimp.createWindowFromTemplate(tpl, 'fileInfo', {}, task);
    const I = w.icons;
    const st = filename ? vfs.stat(filename) : null;
    I[1].setText(filename ?? m('Untitled'));
    I[2].setText(modified ? m('Yes') : m('No'));
    I[3].setText('Music (AF1)');
    I[4].setText(String(saveMaestro(doc).length));
    I[5].setText(st?.date ? new Date(st.date).toLocaleString('en-GB') : '');
    I[6].setSprite?.('file_af1');
    w.on('menuclosed', () => w.delete());
    return w;
  };
  const printBox = () => {
    const w = wimp.createWindowFromTemplate(tpl, 'print_db', {}, task);
    const pr = os.printers;
    w.icons[1].setText(pr?.current?.name ?? m('NoPrinter'));
    w.icons[2].setState({ shaded: !pr?.print });
    w.on('click', (ev) => {
      if (ev.iconIndex !== 2 || ev.button === 'menu' || !pr?.print) return true;
      const c = document.createElement('canvas');
      const last = cols[cols.length - 1];
      c.width = Math.ceil((last.x + last.w) / 2) + 40; c.height = Math.ceil(L.Uc / 2) + TOPY + 20;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      drawScore(g, doc, L, cols, spr, text, { x0: 0, y0: 0, x1: c.width, y1: c.height }, c.width);
      pr.print({ title: filename ?? m('Untitled'), canvas: c });
      wimp.menus.close();
      return true;
    });
    w.on('menuclosed', () => w.delete());
    return w;
  };

  // ------------------------------------------------------------------ dialogue boxes
  const staveNames = () => {
    const stv = channelStaves(doc.staves, doc.perc);
    return stv.map((S) => (S > doc.staves ? m('Perc' + (S - doc.staves)) : m('Stave' + (S + 1))));
  };
  const instruments = () => {
    const w = wimp.createWindowFromTemplate(tpl, 'InstrWind', {}, task);
    const I = w.icons;
    I[44].setState({ deleted: true });
    for (let c = 0; c < 8; c++) I[32 + c].setState({ deleted: true });
    const show = () => {
      const names = staveNames();
      for (let c = 0; c < 8; c++) {
        I[c].setText(names[c]);
        I[8 + c].setText(VOICES[(doc.voices[c] - 1) % VOICES.length] ?? m('MIDIvoice'));
        I[16 + c].setText(m(VOLUME_NAMES[doc.volume[c]]));
        I[24 + c].setText(m(STEREO_KEYS[doc.stereo[c]]));
      }
    };
    show();
    w.on('click', (ev) => {
      if (ev.button === 'menu') return true;
      const i = ev.iconIndex, d = ev.button === 'adjust' ? -1 : 1;
      if (i >= 8 && i < 16) { const c = i - 8; doc.voices[c] = ((doc.voices[c] - 1 + d + VOICES.length) % VOICES.length) + 1; }
      else if (i >= 16 && i < 24) { const c = i - 16; doc.volume[c] = Math.max(0, Math.min(7, doc.volume[c] + d)); }
      else if (i >= 24 && i < 32) { const c = i - 24; doc.stereo[c] = Math.max(0, Math.min(6, doc.stereo[c] + d)); }
      else return true;
      ev.icon?.setState({ selected: false });
      setModified(true); show();
      return true;
    });
    w.on('helprequest', (ev) => { const i = ev.icon?.handle ?? -1; ev.text = i >= 8 && i < 16 ? m('InstrHelp0') : i >= 16 && i < 24 ? m('InstrHelp1') : i >= 24 && i < 32 ? m('InstrHelp2') : null; });
    w.on('menuclosed', () => w.delete());
    return w;
  };
  const timeSigBox = () => {
    const w = wimp.createWindowFromTemplate(tpl, 'TimeSigW', {}, task);
    const I = w.icons;
    const show = () => { I[0].setText(String(timeSig.beats)); I[1].setText(String(DENOMS[timeSig.denom])); };
    show();
    w.on('click', (ev) => {
      if (ev.button === 'menu') return true;
      const d = ev.button === 'adjust' ? -1 : 1;
      if (ev.iconIndex === 0) timeSig.beats = ((timeSig.beats - 1 + d + 16) % 16) + 1;
      if (ev.iconIndex === 1) timeSig.denom = (timeSig.denom + d + 7) % 7;
      show();
      selectPalette({ pane: 'sharp', i: 15 });
      return true;
    });
    w.helpText = m('TimeSigHelp');
    w.on('menuclosed', () => w.delete());
    return w;
  };
  const gotoBox = () => {
    const w = wimp.createWindowFromTemplate(tpl, 'BarW', {}, task);
    const I = w.icons;
    I[0].moveTo({ ...I[0].bbox, x1: Math.min(I[0].bbox.x1, w.w - 1) });
    w.on('key', (ev) => {
      if (ev.code !== 13) return false;
      gotoBar(parseInt(I[0].text, 10) || 1);
      wimp.menus.close();
      return true;
    });
    w.on('menuopen', () => wimp.setCaret(w, I[0]));
    w.on('menuclosed', () => w.delete());
    return w;
  };
  const barColumns = () => cols.map((c, ci) => ({ c, ci })).filter(({ c }) => c.type === 32);
  function gotoBar(n) {
    openScore();
    const bars = barColumns();
    const b = bars[Math.max(0, Math.min(bars.length - 1, n - 1))];
    if (b) score.scrollTo(Math.max(0, b.c.x / 2 - 20), score.scrollY);
  }

  // ------------------------------------------------------------------ playing
  function togglePlay() {
    if (player.playing) { player.stop(); playMarker = null; score?.invalidate(); return; }
    if (!audio()) { task.reportError(m('NoSound')); return; }
    setMasterVolume(VOLUME_AMP[volume] + 16);
    // start from the first column visible in the score window
    let fromItem = 0;
    if (score?.isOpen) {
      const x = score.scrollX * 2;
      const c = cols.find((k) => k.x >= x && k.items.length);
      if (c && score.scrollX > 0) fromItem = c.items[0];
    }
    const perf = perform(doc, { fromItem });
    player.play(perf.events, { length: perf.length, onEnd: () => { playMarker = null; score?.invalidate(); } });
    // position indicator: follow the events
    const evs = perf.events;
    let k = 0;
    const follow = task.animate(() => {
      if (!player.playing) { follow(); return; }
      const t = player.position;
      while (k + 1 < evs.length && evs[k + 1].time <= t) k++;
      const ci = evs[k] && evs[k].time <= t ? itemCol[evs[k].item] : null;
      if (ci !== playMarker) {
        playMarker = ci;
        if (score?.isOpen && ci != null) {
          const x = cols[ci].x / 2;
          if (x < score.scrollX + 20 || x > score.scrollX + score.w - 60) score.scrollTo(Math.max(0, x - 40), score.scrollY);
        }
        score?.invalidate();
      }
    });
  }

  // ------------------------------------------------------------------ menus
  const staveMenu = () => new Menu(m('Staves'), [
    { text: '', writable: { value: String(doc.staves + 1), maxLen: 1, validation: 'A1-4' }, action: (ev) => { const n = parseInt(ev.value, 10); if (n >= 1 && n <= 4 && n - 1 !== doc.staves) { doc.staves = n - 1; setModified(true); relayout(); } }, help: m('StaveHelp0') },
    { text: m('Percussion'), ticked: () => !!doc.perc, action: () => { doc.perc = doc.perc ? 0 : 1; setModified(true); relayout(); }, help: m('StaveHelp1') },
  ]);
  const volMenu = () => new Menu(m('Volume'), VOLUME_NAMES.map((n, i) => ({ text: m(n), ticked: () => volume === i, action: () => { volume = i; if (player.playing) setMasterVolume(VOLUME_AMP[i] + 16); }, help: m('VolumeHelp') })));
  const tempoMenu = () => new Menu(m('Tempo'), TEMPO_NAMES.map((n, i) => ({ text: m(n), ticked: () => doc.tempo === i, action: () => { doc.tempo = i; setModified(true); if (player.playing) { togglePlay(); togglePlay(); } }, help: m('TempoHelp') })));
  const keyList = (minor) => new Menu(m(minor ? 'Minor' : 'Major'), (minor ? MINOR : MAJOR).map((n, i) => ({
    text: m(n), ticked: () => keySel.minor === minor && keySel.i === i, dotted: i === 6 || i === 7,
    action: () => { keySel = { minor, i }; selectPalette({ pane: 'sharp', i: 14 }); }, help: m('KeySigHelp'),
  })));
  const keyMenu = () => new Menu(m('KeySig'), [
    { text: m('Major'), submenu: keyList(false), help: m('MajorKeyHelp') },
    { text: m('Minor'), submenu: keyList(true), help: m('MinorKeyHelp') },
  ]);
  const scoreMenu = () => new Menu(m('Maestro'), [
    { text: m('Save'), submenu: saveBox, help: m('MainHelp0') },
    { text: m('File'), submenu: fileInfo, help: m('MainHelp1') },
    { text: m('Print'), submenu: printBox, help: m('PrintHelp') },
    { text: m('Clear'), dotted: true, help: m('MainHelp2'), action: async () => {
      if (modified && !(await confirmDiscard('clear'))) return;
      player.stop(); playMarker = null; doc = emptyScore(); filename = null; relayout(); setModified(false);
    } },
    { text: m('Staves'), submenu: staveMenu, help: m('MainHelp3') },
    { text: m('Instruments'), submenu: instruments, help: m('MainHelp4') },
    { text: m('Volume'), submenu: volMenu, help: m('MainHelp5') },
    { text: m('Tempo'), submenu: tempoMenu, dotted: true, help: m('MainHelp6') },
    { text: m('TimeSig'), submenu: timeSigBox, help: m('MainHelp7') },
    { text: m('KeySig'), submenu: keyMenu, dotted: true, help: m('MainHelp8') },
    { text: m('Goto'), submenu: gotoBox, shaded: () => player.playing, help: m('MainHelp9') },
    { text: m('Play'), ticked: () => player.playing, action: togglePlay, help: m('MainHelp10') },
  ]);
  let infoWin = null;
  const iconMenu = () => new Menu(m('Maestro'), [
    { text: m('Info'), submenu: () => (infoWin ??= infoBox(task, { ...ctx.app.info, version: m('Version') }, { template: tpl, name: 'progInfo' })), help: m('IconHelp0') },
    { text: m('Quit'), action: quit, help: m('IconHelp1') },
  ]);
  async function quit() {
    if (modified) {
      const w = wimp.createWindowFromTemplate(tpl, 'query', {}, task);
      w.icons[1].setText(m('Unsaved'));
      const r = await new Promise((res) => {
        w.on('click', (ev) => { if (ev.button !== 'menu' && [0, 2].includes(ev.iconIndex)) res(ev.iconIndex); return true; });
        w.on('close', (ev) => { ev.preventDefault(); res(0); });
        w.open({ x: Math.round((wimp.width - w.w) / 2), y: Math.round((wimp.height - w.h) / 2), behind: 'top' });
      });
      w.delete();
      if (r !== 2) return;
    }
    task.quit();
  }

  // ------------------------------------------------------------------ icon bar, messages
  task.addIconbarIcon({
    sprite: '!maestro',
    onClick: (ev) => { if (ev.button !== 'menu') openScore(); },
    menu: iconMenu,
    onDataLoad: (ev) => { loadFile(ev.files?.[0]?.path); },
    help: () => m('IconHelp'),
  });
  task.onMessage('DataOpen', (msg) => { if (msg.filetype === 0xAF1) { loadFile(msg.path); return true; } });
  task.onMessage('DataLoad', (msg) => { const f = msg.files?.[0]; if (f?.filetype === 0xAF1) { loadFile(f.path); return true; } });
  task.onMessage('PreQuit', (msg) => { if (modified) { msg.object?.(); quit(); } });
  task.onMessage('Quit', () => task.quit());
  task.on('run', ({ file }) => { if (!file) openScore(); });

  // test hook
  task.maestro = { get doc() { return doc; }, get player() { return player; }, loadFile, togglePlay, openScore, selectPalette, gotoBar };

  if (ctx.file) await loadFile(ctx.file);
}
