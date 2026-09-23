// SWI dispatch table for BASIC's SYS, the ARM emulator's SWI instruction and BASIC internals.
// Handlers: fn(r, m, ctx) where r is an array of 10+ register values (read/write in place),
// m is the BasicMachine, ctx.flags holds NZCV as a 4 bit value (N=8,Z=4,C=2,V=1).
// A handler may return a Promise (the caller suspends until it resolves).
// Hosts extend the table with machine.registerSwi(number, name, handler).
import { SWI_NAMES } from './swinames.js';
import { BasicError } from './errors.js';

export const XBIT = 0x20000;
export const C_FLAG = 2, V_FLAG = 1, Z_FLAG = 4, N_FLAG = 8;

export class SwiTable {
  constructor() {
    this.byNum = new Map();   // number -> {name, fn}
    this.nameToNum = new Map();
    for (const [n, v] of Object.entries(SWI_NAMES)) this.nameToNum.set(n, v);
  }
  register(num, name, fn) {
    num &= ~XBIT;
    this.byNum.set(num, { name: name || (this.byNum.get(num) || {}).name || this.numToName(num), fn });
    if (name) this.nameToNum.set(name, num);
  }
  /** SWI name -> number (with X prefix handled); undefined if unknown */
  lookup(name) {
    let x = 0;
    let n = name;
    if (n.length > 1 && n[0] === 'X' && this.nameToNum.has(n.slice(1))) { x = XBIT; n = n.slice(1); }
    if (this.nameToNum.has(n)) return this.nameToNum.get(n) | x;
    // OS_WriteI+c style: "OS_WriteI+65"
    const m = /^OS_WriteI\+(.+)$/.exec(n);
    if (m) return (0x100 + (parseInt(m[1], 10) & 255)) | x;
    return undefined;
  }
  numToName(num) {
    const x = num & XBIT ? 'X' : '';
    const base = num & ~XBIT;
    if (base >= 0x100 && base < 0x200) {
      const c = base & 255;
      return x + 'OS_WriteI+' + (c >= 32 && c < 127 ? '"' + String.fromCharCode(c) + '"' : String(c));
    }
    for (const [n, v] of this.nameToNum) if (v === base) return x + n;
    return 'User';
  }
}

const u32 = (x) => x >>> 0;

/** Install the core OS / VDU / ColourTrans / Sound SWIs */
export function installCoreSwis(t) {
  const S = (name, fn) => t.register(SWI_NAMES[name], name, fn);

  S('OS_WriteC', (r, m) => { m.writeC(r[0] & 255); });
  S('OS_Write0', (r, m) => {
    let a = u32(r[0]);
    for (;;) { const c = m.mem.rd8(a++); if (c === 0) break; m.writeC(c); }
    r[0] = a | 0;
  });
  S('OS_NewLine', (r, m) => { m.newLine(); });
  S('OS_WriteN', (r, m) => {
    const a = u32(r[0]); const n = r[1];
    for (let i = 0; i < n; i++) m.writeC(m.mem.rd8(a + i));
  });
  S('OS_ReadC', (r, m, ctx) => {
    const k = m.keyNow();
    if (k >= 0) { r[0] = k; return; }
    return m.waitKey(-1, true).then((k2) => {
      if (k2 === -2) { r[0] = 27; ctx.flags |= C_FLAG; return; }
      r[0] = k2;
    });
  });
  S('OS_CLI', (r, m) => m.oscli(m.mem.rdStrCtrl(u32(r[0]))));
  S('OS_Byte', (r, m, ctx) => m.osbyte(r, ctx));
  S('OS_Word', (r, m, ctx) => m.osword(r, ctx));
  S('OS_ReadLine', (r, m, ctx) => {
    const buf = u32(r[0]) & 0x3FFFFFFF; const max = r[1]; const lo = r[2] & 255; const hi = r[3] & 255;
    return m.readLine(max, lo, hi).then((s) => {
      m.mem.wrStrCR(buf, s);
      r[1] = s.length; ctx.flags &= ~C_FLAG;
    }, (e) => {
      if (e instanceof BasicError && e.number === 17) { ctx.flags |= C_FLAG; r[1] = 0; return; }
      throw e;
    });
  });
  S('OS_GetEnv', (r, m) => { r[0] = m.envPtr(); r[1] = m.interp.memlimit; r[2] = m.scratchStr(String.fromCharCode(0, 0, 0, 0, 0)); });
  S('OS_Exit', (r, m) => { m.interp.quit(r[2] | 0); });
  S('OS_Mouse', (r, m) => { const ms = m.mouse(); r[0] = ms.x; r[1] = ms.y; r[2] = ms.b; r[3] = ms.t; });
  S('OS_ReadUnsigned', (r, m) => {
    let a = u32(r[1]); let base = r[0] & 255 || 10;
    let s = '';
    for (;;) { const c = m.mem.rd8(a); if (c < 33) break; s += String.fromCharCode(c); a++; }
    let i = 0;
    if (s.startsWith('&')) { base = 16; i = 1; } else { const us = s.indexOf('_'); if (us > 0) { base = parseInt(s.slice(0, us), 10); i = us + 1; } }
    let v = 0; let n = 0;
    for (; i < s.length; i++) {
      const d = parseInt(s[i], 36);
      if (Number.isNaN(d) || d >= base) break;
      v = (v * base + d) >>> 0; n++;
    }
    if (!n) throw new BasicError(0x16A, 'Bad number');
    r[1] = (u32(r[1]) + i) | 0; r[2] = v | 0;
  });
  S('OS_ReadVarVal', (r, m, ctx) => {
    const name = m.mem.rdStrCtrl(u32(r[0]));
    const buf = u32(r[1]); const len = r[2];
    const v = m.getSysVar(name);
    if (v === undefined) {
      r[2] = 0; ctx.flags |= V_FLAG;
      throw new BasicError(0x124, 'System variable \'' + name + '\' not found');
    }
    if (len < 0) { r[2] = ~v.length; throw new BasicError(0x1E4, 'Buffer overflow'); }
    const n = Math.min(v.length, len);
    for (let i = 0; i < n; i++) m.mem.wr8(buf + i, v.charCodeAt(i));
    r[2] = n; r[4] = 0;
  });
  S('OS_SetVarVal', (r, m) => {
    const name = m.mem.rdStrCtrl(u32(r[0]));
    const len = r[2]; const type = r[4] & 255;
    if (len < 0) { m.setSysVar(name, undefined); return; }
    let v = type === 1 ? String(r[1]) : ''; // number
    if (type !== 1) {
      const a = u32(r[1]);
      if (type === 0 || type === 2 || type === 4) { v = ''; for (let i = 0; i < len; i++) v += String.fromCharCode(m.mem.rd8(a + i)); }
      if (type === 0) v = m.gstrans(v);
    } else v = String(m.mem.rd32(u32(r[1])));
    m.setSysVar(name, v);
  });
  S('OS_GSTrans', (r, m) => {
    const s = m.gstrans(m.mem.rdStrCtrl(u32(r[0])));
    const buf = u32(r[1]) ; const max = r[2];
    const n = Math.min(s.length, max);
    for (let i = 0; i < n; i++) m.mem.wr8(buf + i, s.charCodeAt(i));
    r[2] = n;
  });
  S('OS_BinaryToDecimal', (r, m) => {
    const s = String(r[0]); const buf = u32(r[1]);
    if (s.length > r[2]) throw new BasicError(0x1E4, 'Buffer overflow');
    for (let i = 0; i < s.length; i++) m.mem.wr8(buf + i, s.charCodeAt(i));
    r[2] = s.length;
  });
  S('OS_GenerateError', (r, m) => {
    const a = u32(r[0]);
    throw new BasicError(m.mem.rd32(a), m.mem.rdStr0(a + 4, 252));
  });
  S('OS_ReadEscapeState', (r, m, ctx) => { if (m.interp.escape) ctx.flags |= C_FLAG; else ctx.flags &= ~C_FLAG; });
  S('OS_ReadPalette', (r, m) => {
    const p = m.vdu ? m.vdu.readPalette(r[0], r[1] & 255) : { first: 0, second: 0 };
    r[2] = p.first | 0; r[3] = p.second | 0;
  });
  S('OS_ReadVduVariables', (r, m) => {
    let a = u32(r[0]); let o = u32(r[1]);
    for (;;) {
      const n = m.mem.rd32(a); a += 4;
      if (n === -1) break;
      m.mem.wr32(o, (m.vduVar(n) | 0)); o += 4;
    }
  });
  S('OS_ReadPoint', (r, m) => {
    const p = m.vdu ? m.vdu.readPoint(r[0], r[1]) : { colour: 0, tint: 0, offScreen: false };
    r[2] = p.colour; r[3] = p.tint; r[4] = p.offScreen ? -1 : 0;
  });
  S('OS_ReadModeVariable', (r, m, ctx) => {
    const mode = r[0] === -1 ? undefined : r[0];
    const v = m.vdu ? m.vdu.modeVar(r[1], mode) : undefined;
    if (v === undefined) { ctx.flags |= C_FLAG; r[2] = 0; } else { ctx.flags &= ~C_FLAG; r[2] = v | 0; }
  });
  S('OS_RemoveCursors', () => {});
  S('OS_RestoreCursors', () => {});
  S('OS_SWINumberToString', (r, m) => {
    const s = m.swis.numToName(r[0]);
    const buf = u32(r[1]);
    m.mem.wrStr0(buf, s.slice(0, Math.max(0, r[2] - 1)));
    r[2] = s.length + 1;
  });
  S('OS_SWINumberFromString', (r, m) => {
    const n = m.swis.lookup(m.mem.rdStrCtrl(u32(r[1])));
    if (n === undefined) throw new BasicError(0x1E6, 'SWI name not known');
    r[0] = n;
  });
  S('OS_ReadMonotonicTime', (r, m) => { r[0] = m.monotonicTime() | 0; });
  S('OS_Plot', (r, m) => { m.plot(r[0], r[1], r[2]); });
  S('OS_ScreenMode', (r, m) => {
    if (r[0] === 0) { const mode = r[1]; if ((mode >>> 0) < 256) m.vduBytes([22, mode]); else m.setModeFromSelector(u32(mode)); }
    else if (r[0] === 1) r[1] = m.vdu ? m.vdu.mode : 12;
  });
  S('OS_CheckModeValid', (r, m, ctx) => {
    const ok = m.vdu && m.vdu.modeVar(0, r[0]) !== undefined;
    if (!ok) { ctx.flags |= C_FLAG; r[0] = -1; } else ctx.flags &= ~C_FLAG;
  });
  S('OS_ReadSysInfo', (r, m) => {
    switch (r[0]) {
      case 0: r[0] = 0x96000; break;       // configured screen size
      case 1: r[0] = 28; r[1] = 0; r[2] = 0; break; // configured mode / sync
      case 2: r[0] = 0x05000000; r[1] = 0x00000101; r[2] = 0x01; break; // IOMD/VIDC20 (RiscPC)
      case 3: r[0] = 0; r[1] = 0; r[2] = 0; break;
      default: r[0] = 0;
    }
  });
  S('OS_SetColour', (r, m) => {
    // Set GCOL colour directly as a colour number (bit 4 = background, bits 0-3 action)
    const flags = r[0]; const col = r[1];
    m.vduBytes([18, flags & 15, (col & 255) | ((flags & 16) ? 128 : 0)]);
  });
  S('OS_UpdateMEMC', (r) => { r[0] = 0; r[1] = 0; });
  S('OS_ChangeEnvironment', (r) => { r[1] = 0; r[2] = 0; r[3] = 0; });
  S('OS_ReadDynamicArea', (r, m) => { if (r[0] === 2) { r[0] = 0x2000000 - 0x1FF00000; r[1] = 0x96000; } else { r[0] = 0x300000; r[1] = 0; } });
  S('OS_ValidateAddress', (r, m, ctx) => { const a = u32(r[0]), b = u32(r[1]); if (b <= m.mem.size && a <= b) ctx.flags &= ~C_FLAG; else ctx.flags |= C_FLAG; });
  S('OS_IntOn', () => {}); S('OS_IntOff', () => {}); S('OS_EnterOS', () => {});
  S('OS_SynchroniseCodeAreas', () => {});
  S('OS_Pointer', (r) => { if (r[0] === 0) r[0] = 1; });
  S('OS_Confirm', (r, m) => m.waitKey(-1).then((k) => { r[0] = k; }));
  S('OS_Heap', (r, m) => m.osHeap(r));
  S('OS_Module', (r, m) => m.osModule(r));
  S('OS_File', (r, m, ctx) => m.osFile(r, ctx));
  S('OS_Find', (r, m) => m.osFind(r));
  S('OS_Args', (r, m) => m.osArgs(r));
  S('OS_BGet', (r, m, ctx) => {
    const c = m.interp.files.bgetRaw(r[1]);
    if (c < 0) { ctx.flags |= C_FLAG; r[0] = -1; } else { ctx.flags &= ~C_FLAG; r[0] = c; }
  });
  S('OS_BPut', (r, m) => { m.interp.files.bput(r[1], r[0] & 255); });
  S('OS_GBPB', (r, m, ctx) => m.osGBPB(r, ctx));
  S('OS_FSControl', (r, m) => m.osFSControl(r));
  S('OS_ReadArgs', (r, m) => m.osReadArgs(r));
  S('OS_EvaluateExpression', (r, m) => m.osEvaluate(r));
  S('OS_PrettyPrint', (r, m) => { m.prettyPrint(m.mem.rdStr0(u32(r[0]))); });

  // Conversions ----------------------------------------------------------------
  const conv = (name, fmt) => S(name, (r, m) => {
    const s = fmt(r[0] | 0);
    const buf = u32(r[1]); const max = r[2];
    if (s.length + 1 > max) throw new BasicError(0x1E4, 'Buffer overflow');
    m.mem.wrStr0(buf, s);
    r[0] = buf | 0; r[1] = (buf + s.length) | 0; r[2] = max - s.length;
  });
  const hex = (n) => (v) => (v >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(8 - n);
  conv('OS_ConvertHex1', hex(1)); conv('OS_ConvertHex2', hex(2)); conv('OS_ConvertHex4', hex(4));
  conv('OS_ConvertHex6', hex(6)); conv('OS_ConvertHex8', hex(8));
  const card = (bits) => (v) => String(bits === 32 ? v >>> 0 : (v >>> 0) & ((1 << bits) - 1));
  conv('OS_ConvertCardinal1', card(8)); conv('OS_ConvertCardinal2', card(16)); conv('OS_ConvertCardinal3', card(24)); conv('OS_ConvertCardinal4', card(32));
  const intg = (bits) => (v) => String(bits === 32 ? v | 0 : ((v << (32 - bits)) >> (32 - bits)));
  conv('OS_ConvertInteger1', intg(8)); conv('OS_ConvertInteger2', intg(16)); conv('OS_ConvertInteger3', intg(24)); conv('OS_ConvertInteger4', intg(32));
  const bin = (bits) => (v) => ((v >>> 0) & (bits === 32 ? 0xFFFFFFFF : (1 << bits) - 1)).toString(2).padStart(bits, '0');
  conv('OS_ConvertBinary1', bin(8)); conv('OS_ConvertBinary2', bin(16)); conv('OS_ConvertBinary3', bin(24)); conv('OS_ConvertBinary4', bin(32));
  const spaced = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  conv('OS_ConvertSpacedCardinal1', (v) => spaced(card(8)(v))); conv('OS_ConvertSpacedCardinal2', (v) => spaced(card(16)(v)));
  conv('OS_ConvertSpacedCardinal3', (v) => spaced(card(24)(v))); conv('OS_ConvertSpacedCardinal4', (v) => spaced(card(32)(v)));
  conv('OS_ConvertSpacedInteger1', (v) => spaced(intg(8)(v))); conv('OS_ConvertSpacedInteger2', (v) => spaced(intg(16)(v)));
  conv('OS_ConvertSpacedInteger3', (v) => spaced(intg(24)(v))); conv('OS_ConvertSpacedInteger4', (v) => spaced(intg(32)(v)));
  conv('OS_ConvertFixedFileSize', (v) => fileSize(v >>> 0, true));
  conv('OS_ConvertFileSize', (v) => fileSize(v >>> 0, false));
  S('OS_ConvertStandardDateAndTime', (r, m) => {
    const t = readUTC5(m, u32(r[0]));
    const s = m.formatTime(t, '%24:%MI:%SE %DY-%M3-%CE%YR');
    const buf = u32(r[1]); m.mem.wrStr0(buf, s); r[0] = buf; r[1] = buf + s.length; r[2] -= s.length;
  });
  S('OS_ConvertDateAndTime', (r, m) => {
    const t = readUTC5(m, u32(r[0]));
    const fmt = m.mem.rdStr0(u32(r[3]));
    const s = m.formatTime(t, fmt);
    const buf = u32(r[1]); m.mem.wrStr0(buf, s); r[0] = buf; r[1] = buf + s.length; r[2] -= s.length;
  });

  // ColourTrans ------------------------------------------------------------------
  S('ColourTrans_SetGCOL', (r, m) => {
    const pal = r[0] >>> 0; const flags = r[3]; const act = r[4] & 255;
    const c = m.nearestColour(pal);
    const bg = (flags & 128) ? 128 : 0;
    m.gcolNumber(act, c, !!bg);
    r[0] = c.gcol;
  });
  S('ColourTrans_SetTextColour', (r, m) => {
    const c = m.nearestColour(r[0] >>> 0);
    m.textColourNumber(c, !!(r[3] & 128));
    r[0] = c.gcol;
  });
  S('ColourTrans_ReturnGCOL', (r, m) => { r[0] = m.nearestColour(r[0] >>> 0).gcol; });
  S('ColourTrans_ReturnColourNumber', (r, m) => { r[0] = m.nearestColour(r[0] >>> 0).num; });
  S('ColourTrans_ReturnColourNumberForMode', (r, m) => { r[0] = m.nearestColour(r[0] >>> 0, r[1]).num; });
  S('ColourTrans_ReturnGCOLForMode', (r, m) => { r[0] = m.nearestColour(r[0] >>> 0, r[1]).gcol; });
  S('ColourTrans_SetColour', (r, m) => { m.gcolNumber(r[4] & 255, { num: r[0], tint: 0, direct: true }, !!(r[3] & 128)); });
  S('ColourTrans_InvalidateCache', () => {});
  S('ColourTrans_SelectTable', (r) => { r[4] = 0; });

  // Sound -------------------------------------------------------------------------
  S('Sound_Control', (r, m) => { m.sound(r[0], r[1], r[2], r[3], null); });
  S('Sound_ControlPacked', (r, m) => {
    const a = r[0] >>> 0, b = r[1] >>> 0;
    m.sound(a & 0xFFFF, (a << 0) >> 16, b & 0xFFFF, b >>> 16, null);
  });
  S('Sound_Enable', (r, m) => { const old = m.soundOn ? 2 : 1; if (r[0] === 1) m.soundEnable(false); else if (r[0] === 2) m.soundEnable(true); r[0] = old; });
  S('Sound_Volume', (r) => { if (r[0] === 0) r[0] = 127; });
  S('Sound_Stereo', (r, m) => { m.stereo(r[0], r[1]); });
  S('Sound_Speaker', (r) => { r[0] = 2; });
  S('Sound_Configure', (r) => { r[0] = 8; r[1] = 208; r[2] = 48; r[3] = 0; r[4] = 0; });
  S('Sound_AttachVoice', (r) => { r[1] = 1; });
  S('Sound_InstallVoice', (r) => { r[1] = 0; });
  S('Sound_Tuning', (r) => { r[0] = 0; });
  S('Sound_QTempo', (r, m) => { const old = m.tempo(); if (r[0]) m.setTempo(r[0]); r[0] = old; });
  S('Sound_QBeat', (r, m) => { r[0] = m.beat(); });
  S('Sound_QSchedule', () => {});

  // BASICTrans (so programs that call it directly get sensible answers) ------
  S('BASICTrans_Message', () => { throw new BasicError(0, 'Not supported'); });

  // Hourglass: nothing visible in single-tasking BASIC
  for (const n of ['Hourglass_On', 'Hourglass_Off', 'Hourglass_Smash', 'Hourglass_Start', 'Hourglass_Percentage', 'Hourglass_LEDs']) S(n, () => {});

  // Territory (minimal)
  S('Territory_Number', (r) => { r[0] = 1; });
  S('Territory_ReadCurrentTimeZone', (r) => { r[0] = 0; r[1] = 0; });
}

function fileSize(v, fixed) {
  let n = v; let u = ' bytes';
  if (n >= 4096 * 1024) { n = Math.floor(n / (1024 * 1024)); u = ' Mbytes'; } else if (n >= 4096) { n = Math.floor(n / 1024); u = ' Kbytes'; }
  const s = String(n);
  if (fixed) return s.padStart(4, ' ') + u.padEnd(7, ' ');
  return s + (u === ' bytes' && n === 1 ? ' byte' : u);
}

function readUTC5(m, a) {
  const lo = m.mem.rd32(a) >>> 0; const hi = m.mem.rd8(a + 4);
  return hi * 4294967296 + lo; // centiseconds since 1900
}
