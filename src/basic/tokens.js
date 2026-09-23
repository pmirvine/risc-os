// BBC BASIC V token tables, tokeniser (lexical analyser) and detokeniser (LIST).
//
// Faithful to ARM BBC BASIC V 1.16 (RISC OS 3.71):
//   vendor/ro371/Sources/Programmer/BASIC/Lexical  (MATCH, TOKOUT, RTABLE, PLEXA table)
//   vendor/ro371/Sources/Programmer/BASIC/Basic    (token numbering, INSRT)
//   vendor/ro371/Sources/Programmer/BASIC/Command  (LIST / LISTO)
//
// Program format in memory / in ,ffb files:
//   each line: 0x0D, lineHi, lineLo, len, <body bytes>   (len = body length + 4)
//   end of program: 0x0D, 0xFF
// Line number references (after GOTO/GOSUB/RESTORE/THEN/ELSE...) are 0x8D b1 b2 b3.

// ---------------------------------------------------------------------------
// Token values
// ---------------------------------------------------------------------------
export const T = {
  OTHERWISE: 0x7F, AND: 0x80, DIV: 0x81, EOR: 0x82, MOD: 0x83, OR: 0x84,
  ERROR: 0x85, LINE: 0x86, OFF: 0x87, STEP: 0x88, SPC: 0x89, TAB: 0x8A, ELSE: 0x8B, THEN: 0x8C,
  CONST: 0x8D, OPENIN: 0x8E,
  PTR: 0x8F, PAGE: 0x90, TIME: 0x91, LOMEM: 0x92, HIMEM: 0x93,
  ABS: 0x94, ACS: 0x95, ADVAL: 0x96, ASC: 0x97, ASN: 0x98, ATN: 0x99, BGET: 0x9A, COS: 0x9B,
  COUNT: 0x9C, DEG: 0x9D, ERL: 0x9E, ERR: 0x9F, EVAL: 0xA0, EXP: 0xA1, EXT: 0xA2, FALSE: 0xA3,
  FN: 0xA4, GET: 0xA5, INKEY: 0xA6, INSTR: 0xA7, INT: 0xA8, LEN: 0xA9, LN: 0xAA, LOG: 0xAB,
  NOT: 0xAC, OPENUP: 0xAD, OPENOUT: 0xAE, PI: 0xAF, POINT: 0xB0, POS: 0xB1, RAD: 0xB2, RND: 0xB3,
  SGN: 0xB4, SIN: 0xB5, SQR: 0xB6, TAN: 0xB7, TO: 0xB8, TRUE: 0xB9, USR: 0xBA, VAL: 0xBB, VPOS: 0xBC,
  CHRS: 0xBD, GETS: 0xBE, INKEYS: 0xBF, LEFTS: 0xC0, MIDS: 0xC1, RIGHTS: 0xC2, STRS: 0xC3,
  STRINGS: 0xC4, EOF: 0xC5,
  ESCFN: 0xC6, ESCCOM: 0xC7, ESCSTMT: 0xC8,
  WHEN: 0xC9, OF: 0xCA, ENDCASE: 0xCB, ELSE2: 0xCC, ENDIF: 0xCD, ENDWHILE: 0xCE,
  PTR2: 0xCF, PAGE2: 0xD0, TIME2: 0xD1, LOMEM2: 0xD2, HIMEM2: 0xD3,
  SOUND: 0xD4, BPUT: 0xD5, CALL: 0xD6, CHAIN: 0xD7, CLEAR: 0xD8, CLOSE: 0xD9, CLG: 0xDA, CLS: 0xDB,
  DATA: 0xDC, DEF: 0xDD, DIM: 0xDE, DRAW: 0xDF, END: 0xE0, ENDPROC: 0xE1, ENVELOPE: 0xE2, FOR: 0xE3,
  GOSUB: 0xE4, GOTO: 0xE5, GCOL: 0xE6, IF: 0xE7, INPUT: 0xE8, LET: 0xE9, LOCAL: 0xEA, MODE: 0xEB,
  MOVE: 0xEC, NEXT: 0xED, ON: 0xEE, VDU: 0xEF, PLOT: 0xF0, PRINT: 0xF1, PROC: 0xF2, READ: 0xF3,
  REM: 0xF4, REPEAT: 0xF5, REPORT: 0xF6, RESTORE: 0xF7, RETURN: 0xF8, RUN: 0xF9, STOP: 0xFA,
  COLOUR: 0xFB, TRACE: 0xFC, UNTIL: 0xFD, WIDTH: 0xFE, OSCLI: 0xFF,
};
// Two byte function tokens (prefix 0xC6)
export const TF = { SUM: 0x8E, BEAT: 0x8F };
// Two byte statement tokens (prefix 0xC8)
export const TS = {
  CASE: 0x8E, CIRCLE: 0x8F, FILL: 0x90, ORIGIN: 0x91, POINT: 0x92, RECTANGLE: 0x93, SWAP: 0x94,
  WHILE: 0x95, WAIT: 0x96, MOUSE: 0x97, QUIT: 0x98, SYS: 0x99, INSTALL: 0x9A, LIBRARY: 0x9B,
  TINT: 0x9C, ELLIPSE: 0x9D, BEATS: 0x9E, TEMPO: 0x9F, VOICES: 0xA0, VOICE: 0xA1, STEREO: 0xA2,
  OVERLAY: 0xA3,
};
// Two byte command tokens (prefix 0xC7)
export const TC = {
  APPEND: 0x8E, AUTO: 0x8F, CRUNCH: 0x90, DELETE: 0x91, EDIT: 0x92, HELP: 0x93, LIST: 0x94,
  LOAD: 0x95, LVAR: 0x96, NEW: 0x97, OLD: 0x98, RENUMBER: 0x99, SAVE: 0x9A, TEXTLOAD: 0x9B,
  TEXTSAVE: 0x9C, TWIN: 0x9D, TWINO: 0x9E, INSTALL: 0x9F,
};

const UNLIST = ' unlistable token ';

// Names used by LIST for single byte tokens 0x7F..0xFF (RTABLE)
export const TOKEN_NAMES = (() => {
  const n = new Array(256).fill(null);
  const list = [
    'OTHERWISE', 'AND', 'DIV', 'EOR', 'MOD', 'OR', 'ERROR', 'LINE', 'OFF', 'STEP', 'SPC', 'TAB(',
    'ELSE', 'THEN', UNLIST, 'OPENIN', 'PTR', 'PAGE', 'TIME', 'LOMEM', 'HIMEM', 'ABS', 'ACS', 'ADVAL',
    'ASC', 'ASN', 'ATN', 'BGET', 'COS', 'COUNT', 'DEG', 'ERL', 'ERR', 'EVAL', 'EXP', 'EXT', 'FALSE',
    'FN', 'GET', 'INKEY', 'INSTR(', 'INT', 'LEN', 'LN', 'LOG', 'NOT', 'OPENUP', 'OPENOUT', 'PI',
    'POINT(', 'POS', 'RAD', 'RND', 'SGN', 'SIN', 'SQR', 'TAN', 'TO', 'TRUE', 'USR', 'VAL', 'VPOS',
    'CHR$', 'GET$', 'INKEY$', 'LEFT$(', 'MID$(', 'RIGHT$(', 'STR$', 'STRING$(', 'EOF',
    UNLIST, UNLIST, UNLIST, 'WHEN', 'OF', 'ENDCASE', 'ELSE', 'ENDIF', 'ENDWHILE',
    'PTR', 'PAGE', 'TIME', 'LOMEM', 'HIMEM', 'SOUND', 'BPUT', 'CALL', 'CHAIN', 'CLEAR', 'CLOSE',
    'CLG', 'CLS', 'DATA', 'DEF', 'DIM', 'DRAW', 'END', 'ENDPROC', 'ENVELOPE', 'FOR', 'GOSUB', 'GOTO',
    'GCOL', 'IF', 'INPUT', 'LET', 'LOCAL', 'MODE', 'MOVE', 'NEXT', 'ON', 'VDU', 'PLOT', 'PRINT',
    'PROC', 'READ', 'REM', 'REPEAT', 'REPORT', 'RESTORE', 'RETURN', 'RUN', 'STOP', 'COLOUR', 'TRACE',
    'UNTIL', 'WIDTH', 'OSCLI',
  ];
  for (let i = 0; i < list.length; i++) n[0x7F + i] = list[i];
  return n;
})();
export const FN_NAMES = ['SUM', 'BEAT'];
export const STMT_NAMES = ['CASE', 'CIRCLE', 'FILL', 'ORIGIN', 'POINT', 'RECTANGLE', 'SWAP', 'WHILE',
  'WAIT', 'MOUSE', 'QUIT', 'SYS', 'INSTALL', 'LIBRARY', 'TINT', 'ELLIPSE', 'BEATS', 'TEMPO', 'VOICES',
  'VOICE', 'STEREO', 'OVERLAY'];
export const COM_NAMES = ['APPEND', 'AUTO', 'CRUNCH', 'DELETE', 'EDIT', 'HELP', 'LIST', 'LOAD', 'LVAR',
  'NEW', 'OLD', 'RENUMBER', 'SAVE', 'TEXTLOAD', 'TEXTSAVE', 'TWIN', 'TWINO', 'INSTALL'];

/** Name of the token at bytes[i] (and bytes[i+1] for two byte tokens). */
export function tokenName(b, b2) {
  let tab = null;
  if (b === T.ESCFN) tab = FN_NAMES;
  else if (b === T.ESCCOM) tab = COM_NAMES;
  else if (b === T.ESCSTMT) tab = STMT_NAMES;
  if (tab) {
    const i = (b2 | 0) - 0x8E;
    return (i >= 0 && i < tab.length) ? tab[i] : UNLIST;
  }
  return TOKEN_NAMES[b] || UNLIST;
}

// ---------------------------------------------------------------------------
// Lexical table (PLEXA ..): [name, token, job]. MUST stay in source order.
// job bits: 7 own bracket, 6 polymorphic / two byte statement, 5 give up (rest of line literal),
//           4 line-number constants may follow, 3 two byte token, 2 -> left mode / two byte function,
//           1 -> right mode, 0 ignore if next char is a word character
// ---------------------------------------------------------------------------
const LEX = [
  ['AND', T.AND, 2], ['ABS', T.ABS, 0], ['ACS', T.ACS, 0], ['ADVAL', T.ADVAL, 0], ['ASC', T.ASC, 0],
  ['ASN', T.ASN, 0], ['ATN', T.ATN, 0], ['AUTO', TC.AUTO, 16 + 8], ['APPEND', TC.APPEND, 8 + 2],
  ['BGET', T.BGET, 1], ['BPUT', T.BPUT, 2 + 1], ['BEATS', TS.BEATS, 64 + 8 + 2], ['BEAT', TF.BEAT, 8 + 4 + 2],
  ['COLOUR', T.COLOUR, 2], ['CALL', T.CALL, 2], ['CASE', TS.CASE, 64 + 8 + 2], ['CHAIN', T.CHAIN, 2],
  ['CHR$', T.CHRS, 0], ['CLEAR', T.CLEAR, 1], ['CLOSE', T.CLOSE, 2 + 1], ['CLG', T.CLG, 1],
  ['CLS', T.CLS, 1], ['COS', T.COS, 0], ['COUNT', T.COUNT, 1], ['CIRCLE', TS.CIRCLE, 64 + 8 + 2],
  ['CRUNCH', TC.CRUNCH, 8 + 2], ['COLOR', T.COLOUR, 2],
  ['DATA', T.DATA, 32], ['DEG', T.DEG, 0], ['DEF', T.DEF, 0], ['DELETE', TC.DELETE, 16 + 8],
  ['DIV', T.DIV, 0], ['DIM', T.DIM, 2], ['DRAW', T.DRAW, 2],
  ['ENDPROC', T.ENDPROC, 1], ['EDIT', TC.EDIT, 32 + 8], ['ENDWHILE', T.ENDWHILE, 1],
  ['ENDCASE', T.ENDCASE, 1], ['ENDIF', T.ENDIF, 1], ['END', T.END, 1], ['ENVELOPE', T.ENVELOPE, 2],
  ['ELSE', T.ELSE, 16 + 4], ['EVAL', T.EVAL, 0], ['ERL', T.ERL, 1], ['ERROR', T.ERROR, 4],
  ['EOF', T.EOF, 1], ['EOR', T.EOR, 2], ['ERR', T.ERR, 1], ['EXP', T.EXP, 0], ['EXT', T.EXT, 1],
  ['ELLIPSE', TS.ELLIPSE, 64 + 8 + 2],
  ['FOR', T.FOR, 2], ['FALSE', T.FALSE, 1], ['FILL', TS.FILL, 64 + 8 + 2], ['FN', T.FN, 2],
  ['GOTO', T.GOTO, 16 + 2], ['GET$', T.GETS, 0], ['GET', T.GET, 0], ['GOSUB', T.GOSUB, 16 + 2],
  ['GCOL', T.GCOL, 2],
  ['HIMEM', T.HIMEM, 64 + 2 + 1], ['HELP', TC.HELP, 8 + 1],
  ['INPUT', T.INPUT, 2], ['IF', T.IF, 2], ['INKEY$', T.INKEYS, 0], ['INKEY', T.INKEY, 0],
  ['INT', T.INT, 0], ['INSTR(', T.INSTR, 128], ['INSTALL', TC.INSTALL, 8 + 2],
  ['LIST', TC.LIST, 16 + 8], ['LINE', T.LINE, 2], ['LOAD', TC.LOAD, 2 + 8], ['LOMEM', T.LOMEM, 64 + 2 + 1],
  ['LOCAL', T.LOCAL, 2], ['LEFT$(', T.LEFTS, 128], ['LEN', T.LEN, 0], ['LET', T.LET, 4],
  ['LOG', T.LOG, 0], ['LN', T.LN, 0], ['LIBRARY', TS.LIBRARY, 64 + 8 + 2], ['LVAR', TC.LVAR, 8 + 1],
  ['MID$(', T.MIDS, 128], ['MODE', T.MODE, 2], ['MOD', T.MOD, 0], ['MOVE', T.MOVE, 2],
  ['MOUSE', TS.MOUSE, 64 + 8 + 2],
  ['NEXT', T.NEXT, 2], ['NEW', TC.NEW, 8 + 1], ['NOT', T.NOT, 0],
  ['OLD', TC.OLD, 8 + 1], ['ON', T.ON, 2], ['OFF', T.OFF, 0], ['OF', T.OF, 0],
  ['ORIGIN', TS.ORIGIN, 64 + 8 + 2], ['OR', T.OR, 2], ['OPENIN', T.OPENIN, 0], ['OPENOUT', T.OPENOUT, 0],
  ['OPENUP', T.OPENUP, 0], ['OSCLI', T.OSCLI, 2], ['OTHERWISE', T.OTHERWISE, 4],
  ['OVERLAY', TS.OVERLAY, 64 + 8 + 2],
  ['PRINT', T.PRINT, 2], ['PAGE', T.PAGE, 64 + 2 + 1], ['PTR', T.PTR, 64 + 2 + 1], ['PI', T.PI, 1],
  ['PLOT', T.PLOT, 2], ['POINT(', T.POINT, 128], ['POINT', TS.POINT, 64 + 8 + 2], ['PROC', T.PROC, 2],
  ['POS', T.POS, 1],
  ['QUIT', TS.QUIT, 64 + 8 + 1],
  ['RETURN', T.RETURN, 1], ['REPEAT', T.REPEAT, 0], ['REPORT', T.REPORT, 1], ['READ', T.READ, 2],
  ['REM', T.REM, 32], ['RUN', T.RUN, 1], ['RAD', T.RAD, 0], ['RESTORE', T.RESTORE, 16 + 2],
  ['RIGHT$(', T.RIGHTS, 128], ['RND', T.RND, 1], ['RECTANGLE', TS.RECTANGLE, 64 + 8 + 2],
  ['RENUMBER', TC.RENUMBER, 16 + 8],
  ['STEP', T.STEP, 0], ['SAVE', TC.SAVE, 8 + 2], ['SGN', T.SGN, 0], ['SIN', T.SIN, 0], ['SQR', T.SQR, 0],
  ['SOUND', T.SOUND, 2], ['SPC', T.SPC, 0], ['STR$', T.STRS, 0], ['STRING$(', T.STRINGS, 128],
  ['STOP', T.STOP, 1], ['STEREO', TS.STEREO, 64 + 8 + 2], ['SUM', TF.SUM, 8 + 4 + 2],
  ['SWAP', TS.SWAP, 64 + 8 + 2], ['SYS', TS.SYS, 64 + 8 + 2],
  ['TAN', T.TAN, 0], ['TAB(', T.TAB, 128], ['TEMPO', TS.TEMPO, 64 + 8 + 2],
  ['TEXTLOAD', TC.TEXTLOAD, 8 + 2], ['TEXTSAVE', TC.TEXTSAVE, 8 + 2], ['THEN', T.THEN, 16 + 4],
  ['TIME', T.TIME, 64 + 2 + 1], ['TINT', TS.TINT, 64 + 8 + 2], ['TO', T.TO, 0], ['TRACE', T.TRACE, 16 + 2],
  ['TRUE', T.TRUE, 1], ['TWINO', TC.TWINO, 8 + 2], ['TWIN', TC.TWIN, 8 + 1],
  ['UNTIL', T.UNTIL, 2], ['USR', T.USR, 0],
  ['VDU', T.VDU, 2], ['VAL', T.VAL, 0], ['VPOS', T.VPOS, 1], ['VOICES', TS.VOICES, 64 + 8 + 2],
  ['VOICE', TS.VOICE, 64 + 8 + 2],
  ['WHILE', TS.WHILE, 64 + 8 + 2], ['WHEN', T.WHEN, 2], ['WAIT', TS.WAIT, 64 + 8 + 1], ['WIDTH', T.WIDTH, 2],
].map(([name, tok, job]) => ({ name, tok, job, codes: Array.from(name, (c) => c.charCodeAt(0)) }));

// Index of first entry for each letter A..W
const LEX_INDEX = new Array(128).fill(-1);
for (let i = LEX.length - 1; i >= 0; i--) LEX_INDEX[LEX[i].codes[0]] = i;
export const LEX_TABLE = LEX;

const isDigit = (c) => c >= 0x30 && c <= 0x39;
// WORDCQ: 0-9 A-Z _ ` a-z
export const isWordChar = (c) => (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x5F && c <= 0x7A);

/** Encode a line number as the 3 bytes following 0x8D (CONSTI). */
export function encodeLineNumber(n) {
  const lo = n & 0xFF, hi = (n >> 8) & 0xFF;
  const b1 = (((hi >> 4) & 0x0C) | ((lo & 0xC0) >> 2)) ^ 0x54;
  return [b1, (lo & 0x3F) | 0x40, (hi & 0x3F) | 0x40];
}
/** Decode the 3 bytes after 0x8D (SPGETN). */
export function decodeLineNumber(b1, b2, b3) {
  const r0 = (b1 << 2) & 0xFF;
  const lo = ((r0 & 0xC0) ^ b2) & 0xFF;
  const hi = (b3 ^ ((r0 << 2) & 0xFF)) & 0xFF;
  return lo | (hi << 8);
}

/**
 * Tokenise one line of text (MATCH / EVMATCH).
 * @param {string|number[]|Uint8Array} src  text without the terminating CR (char codes 0-255)
 * @param {object} [o]  o.mode: 'line' (default, program/command line: left mode, line number constants),
 *                      'eval' (EVAL: right mode, no constants)
 * @returns {{bytes:number[], unmatchedBrackets:boolean, lineTooBig:boolean, unmatchedQuote:boolean}}
 *          bytes do NOT include the terminating 0x0D.
 */
export function tokenise(src, o = {}) {
  const s = typeof src === 'string' ? Array.from(src, (c) => c.charCodeAt(0) & 0xFF) : Array.from(src);
  s.push(13);
  const out = [];
  let si = 0;
  let smode = 0; // bit0 in string, bit2 give up, bit8 line no too big, bits 12+ bracket count (signed)
  let brackets = 0;
  let consta, mode;
  if (o.mode === 'eval') { consta = false; mode = 1; } else { consta = true; mode = 0; }
  let c;
  let reexamine = false; // true => examine c (already copied) at label 00
  for (;;) {
    if (!reexamine) { c = s[si++]; out.push(c); }
    reexamine = false;
    // label 00
    if (c === 0x20) continue;
    if (c === 10) { c = 13; out[out.length - 1] = 13; }
    if (c === 13) { out.pop(); break; }
    if (c === 0x22) smode ^= 1;
    if (smode & 0xFF) continue;
    if (c === 0x28) brackets++;
    if (c === 0x29) brackets--;
    let atLabel10 = false;
    if (c === 0x26) { // & hex constant: copy hex digits
      for (;;) {
        c = s[si++]; out.push(c);
        if (isDigit(c)) continue;
        if (c < 0x41) { reexamine = true; break; }
        if (c < 0x47) continue;
        if (c < 0x61) { atLabel10 = true; break; }
        if (c < 0x67) continue;
        atLabel10 = true; break;
      }
      if (reexamine) continue;
    }
    // label 10
    if (c === 0x3A) { consta = false; mode = 0; continue; } // ':' start of statement (95)
    if (c === 0x2C) continue;
    if (c === 0x2A) { // '*'
      if (mode === 0) { smode |= 4; continue; }
      consta = false; mode = 1; continue;
    }
    if (c === 0x2E) { // '.' => MATCHZ
      ({ c, si } = matchz(s, si, out)); consta = false; mode = 1; reexamine = true; continue;
    }
    if (isDigit(c)) {
      if (!consta) { ({ c, si } = matchz(s, si, out)); consta = false; mode = 1; reexamine = true; continue; }
      // try a line number constant
      let v = c & 15; let j = si; let ok = true;
      for (;;) {
        const d = s[j++];
        if (!isDigit(d)) { c = d; break; }
        v = v * 10 + (d & 15);
        if (v >= 65280) { ok = false; break; }
      }
      if (!ok) {
        smode |= 256;
        ({ c, si } = matchz(s, si, out)); consta = false; mode = 1; reexamine = true; continue;
      }
      si = j;
      out[out.length - 1] = T.CONST;
      out.push(...encodeLineNumber(v));
      out.push(c);
      reexamine = true; continue; // constant mode unchanged
    }
    // label 30: letters
    if (c < 0x41) { consta = false; mode = 1; continue; } // YMATCH
    if (c > 0x57 || LEX_INDEX[c] < 0) { // > 'W' (or letter with no table, J/K/Q...) MATCHW
      if (!isWordChar(c)) { consta = false; mode = 1; continue; }
      // MATCHH: copy whole word
      for (;;) { c = s[si++]; out.push(c); if (!isWordChar(c)) break; }
      consta = false; mode = 1; reexamine = true; continue;
    }
    // table lookup
    const first = c;
    const startSi = si; // position after first char (R8)
    let found = null;
    for (let k = LEX_INDEX[first]; k < LEX.length && LEX[k].codes[0] === first; k++) {
      const e = LEX[k];
      let j = startSi; let m = 1; let matched = false;
      for (;;) {
        if (m >= e.codes.length) { matched = true; break; }
        const sc = s[j++];
        if (sc === e.codes[m]) { m++; continue; }
        if (sc === 0x2E) { matched = true; break; } // abbreviation
        break;
      }
      if (matched) { found = { e, end: j }; break; }
    }
    if (found) {
      const { e } = found;
      const job = e.job;
      let ok = true;
      if (job & 1) { // ignore if next char is word char
        if (isWordChar(s[found.end])) ok = false;
      }
      if (ok) {
        si = found.end;
        let tok = e.tok;
        if (job & 8) {
          let esc = T.ESCCOM;
          if (job & 64) esc = T.ESCSTMT;
          let jb = job;
          if (jb & 4) { esc = T.ESCFN; }
          out[out.length - 1] = esc;
          out.push(tok);
        } else {
          if ((job & 64) && mode === 0) tok += T.PTR2 - T.PTR;
          out[out.length - 1] = tok;
        }
        const effJob = (job & 8) && (job & 4) ? (job & ~4) : job;
        if (effJob & 2) { mode = 1; consta = false; }
        if (effJob & 4) { mode = 0; consta = false; }
        if (tok === T.FN || tok === T.PROC) {
          if (!(job & 8)) {
            for (;;) { c = s[si++]; out.push(c); if (!isWordChar(c)) break; }
            si--; out.pop();
          }
        }
        if (job & 16) consta = true;
        if (job & 32) smode |= 4;
        if (job & 128) brackets++;
        continue;
      }
    }
    // not found (MATCHG -> MATCHH): copy the rest of the word
    si = startSi;
    for (;;) { c = s[si++]; out.push(c); if (!isWordChar(c)) break; }
    consta = false; mode = 1; reexamine = true; continue;
  }
  return { bytes: out, unmatchedBrackets: brackets !== 0, lineTooBig: !!(smode & 256), unmatchedQuote: (smode & 0xFF) === 1 };
}

function matchz(s, si, out) {
  // copy chars while digit or '.'; returns the first other char (already copied)
  let c;
  for (;;) { c = s[si++]; out.push(c); if (!(isDigit(c) || c === 0x2E)) break; }
  return { c, si };
}

/**
 * Parse a program line typed at the prompt / read from a text file:
 * returns {lineNumber|null, body:number[]} where body is ready to insert (INSRT rules:
 * trailing spaces removed, leading ELSE turned into ELSE2 when stored).
 */
export function tokeniseProgramLine(text, listo = 0) {
  const r = tokenise(text);
  const b = r.bytes;
  let i = 0;
  while (b[i] === 0x20) i++;
  if (b[i] !== T.CONST) return { lineNumber: null, body: b, warn: r };
  const lineNumber = decodeLineNumber(b[i + 1], b[i + 2], b[i + 3]);
  i += 4;
  let body = b.slice(i);
  // INSRT: if LISTO<>0 leading spaces are skipped (BL SPACES; SUB LINE,LINE,#1)
  if (listo !== 0) { let k = 0; while (body[k] === 0x20) k++; body = body.slice(k); }
  body = finishLineBody(body);
  return { lineNumber, body, warn: r };
}

/** Apply INSRT's trailing space strip and leading ELSE -> ELSE2 conversion. */
export function finishLineBody(body) {
  let end = body.length;
  while (end > 0 && body[end - 1] === 0x20) end--;
  body = body.slice(0, end);
  let k = 0; while (body[k] === 0x20) k++;
  if (body[k] === T.ELSE) { body = body.slice(); body[k] = T.ELSE2; }
  return body;
}

// ---------------------------------------------------------------------------
// Program images
// ---------------------------------------------------------------------------

/** Parse a tokenised program image (starting with 0x0D). Returns {lines:[{num, body:Uint8Array}], end} or null if bad. */
export function parseProgram(bytes) {
  const lines = [];
  let p = 0;
  for (;;) {
    if (p >= bytes.length || bytes[p] !== 13) return null;
    if (bytes[p + 1] === 0xFF) return { lines, end: p + 2 };
    if (p + 3 >= bytes.length) return null;
    const num = (bytes[p + 1] << 8) | bytes[p + 2];
    const len = bytes[p + 3];
    if (len < 4) return null;
    lines.push({ num, body: bytes.slice(p + 4, p + len) });
    p += len;
  }
}

/** Is this a tokenised BASIC image? (LOADFILEINCORE check) */
export function isTokenised(bytes) {
  return parseProgram(bytes) !== null;
}

/** Build a program image from [{num, body}] */
export function buildProgram(lines) {
  let size = 2;
  for (const l of lines) size += l.body.length + 4;
  const out = new Uint8Array(size);
  let p = 0;
  for (const l of lines) {
    out[p++] = 13; out[p++] = (l.num >> 8) & 0xFF; out[p++] = l.num & 0xFF; out[p++] = l.body.length + 4;
    out.set(l.body, p); p += l.body.length;
  }
  out[p++] = 13; out[p++] = 0xFF;
  return out;
}

/**
 * Convert text (e.g. a TEXTLOADed file) to program lines, like LOADFILE0:
 * lines without numbers get the previous number (inserted at the end) and the program is then
 * renumbered 10,10. Returns {lines, renumbered}.
 */
export function textToLines(text) {
  const src = typeof text === 'string' ? text : String.fromCharCode(...text);
  const rawLines = src.split(/\r\n|\n\r|\n|\r/);
  if (rawLines.length && rawLines[rawLines.length - 1] === '') rawLines.pop();
  let lines = [];
  let needRenumber = false;
  let lastNum = 9;
  for (const raw of rawLines) {
    if (raw.length > 255) throw new Error('Line too long');
    const r = tokeniseProgramLine(raw);
    if (r.lineNumber === null) {
      needRenumber = true;
      const body = finishLineBody(r.body);
      lines.push({ num: lastNum, body: Uint8Array.from(body) });
    } else {
      lastNum = r.lineNumber;
      if (r.body.length === 0) { lines = lines.filter((l) => l.num !== r.lineNumber); continue; }
      lines = insertLine(lines, r.lineNumber, Uint8Array.from(r.body));
    }
  }
  if (needRenumber) lines = renumber(lines, 10, 10).lines;
  return { lines, renumbered: needRenumber };
}

export function insertLine(lines, num, body) {
  const out = lines.filter((l) => l.num !== num);
  let i = 0;
  while (i < out.length && out[i].num < num) i++;
  if (body && body.length) out.splice(i, 0, { num, body });
  return out;
}

/** RENUMBER start,step: renumbers lines and all 0x8D references. */
export function renumber(lines, start = 10, step = 10) {
  const map = new Map();
  const newNums = [];
  let n = start;
  for (const l of lines) {
    if (n > 65279) throw Object.assign(new Error('Line numbers larger than 65279 would be generated by this renumber'), { basicErr: 'ERNUMO' });
    if (!map.has(l.num)) map.set(l.num, n);
    newNums.push(n);
    n += step;
  }
  const failed = [];
  const out = lines.map((l, idx) => {
    const b = Uint8Array.from(l.body);
    forEachLineRef(b, (pos, ref) => {
      const nn = map.get(ref);
      if (nn === undefined) { failed.push([map.get(l.num), ref]); return; }
      const e = encodeLineNumber(nn);
      b[pos + 1] = e[0]; b[pos + 2] = e[1]; b[pos + 3] = e[2];
    });
    return { num: newNums[idx], body: b };
  });
  return { lines: out, failed };
}

/** Calls fn(pos, lineNumber) for each 0x8D constant in a line body (outside strings / REM / DATA). */
export function forEachLineRef(b, fn) {
  let inStr = false;
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c === 0x22) { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === T.REM || c === T.DATA) return;
    if (c === T.ESCFN || c === T.ESCCOM || c === T.ESCSTMT) { i++; continue; }
    if (c === T.CONST && i + 3 < b.length + 1) {
      fn(i, decodeLineNumber(b[i + 1], b[i + 2], b[i + 3]));
      i += 3;
    }
  }
}

// ---------------------------------------------------------------------------
// Detokeniser (LIST)
// ---------------------------------------------------------------------------

/**
 * Detokenise a line body into text exactly as LIST would print it (without the line number).
 * @param {Uint8Array|number[]} body
 * @param {number} [listo] LISTO bits: 4 = lower case tokens(16) ... (bit 2 split at ':' is handled by listLine)
 */
export function detokenise(body, listo = 0) {
  let s = '';
  let quote = false; let rem = false;
  const lower = !!(listo & 16);
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === 0x22) quote = !quote;
    if (quote || rem || c < 0x7F) { s += String.fromCharCode(c); continue; }
    if (c === T.CONST) {
      s += String(decodeLineNumber(body[i + 1], body[i + 2], body[i + 3]));
      i += 3; continue;
    }
    if (c === T.REM) rem = true;
    let name;
    if (c === T.ESCFN || c === T.ESCCOM || c === T.ESCSTMT) { name = tokenName(c, body[i + 1]); i++; } else name = tokenName(c);
    s += lower ? name.replace(/[A-Z]/g, (m) => m.toLowerCase()) : name;
  }
  return s;
}

/** Format a line number as LIST does (NPRN: right justified in 5). */
export function listLineNumber(n) {
  return String(n).padStart(5, ' ');
}

/**
 * Produce LIST output lines for a whole program (array of strings) honouring LISTO.
 * LISTO bits: 0 space after line number, 1 indent structures, 2 split lines at ':',
 * 3 don't list line numbers, 4 lower case keywords.
 */
export function listProgram(lines, listo = 0, from = 0, to = 65279, match = null) {
  const out = [];
  let indent = 0;
  for (const l of lines) {
    if (l.num < from) { indent = computeIndent(l.body, indent).next; continue; }
    if (l.num > to) break;
    const { use, next } = computeIndent(l.body, indent);
    indent = next;
    if (match && !lineMatches(l.body, match)) continue;
    out.push(...listLine(l.num, l.body, listo, use));
  }
  return out;
}

function lineMatches(body, pat) {
  // simple byte substring match of tokenised pattern in the line (outside of consideration of quotes)
  outer: for (let i = 0; i + pat.length <= body.length; i++) {
    for (let j = 0; j < pat.length; j++) if (body[i + j] !== pat[j]) continue outer;
    return true;
  }
  return pat.length === 0;
}

/** Structure indentation computation (LTTEST): returns indent to use for this line and the next count. */
export function computeIndent(body, count) {
  if (count < 0) count = 0;
  const old = count;
  let q = 0; let rem = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === T.REM) rem = true;
    if (c === 0x22) q ^= 1;
    if (rem || q) continue;
    if (c === T.CONST) { i += 3; continue; }
    if (c === T.NEXT || c === T.UNTIL || c === T.ENDWHILE || c === T.ENDCASE || c === T.ENDIF) count -= 2;
    if (c === T.FOR || c === T.REPEAT) count += 2;
    if (i > 0 && body[i - 1] === T.ESCSTMT && (c === TS.WHILE || c === TS.CASE)) count += 2;
    if (c === T.ESCFN || c === T.ESCCOM || c === T.ESCSTMT) { /* next byte examined on next loop iteration */ }
  }
  if (body.length && body[body.length - 1] === T.THEN) count += 2;
  return { use: Math.min(old, count) < 0 ? 0 : Math.min(old, count), next: count };
}

/** LISTLINE: returns one or more text lines for a program line. */
export function listLine(num, body, listo = 0, indent = 0) {
  const res = [];
  let cur = '';
  if (!(listo & 8)) cur += listLineNumber(num);
  if (listo & 1) cur += ' ';
  if (indent && (listo & 2)) cur += ' '.repeat(indent);
  let quote = false; let rem = false;
  const lower = !!(listo & 16);
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === 0x22) quote = !quote;
    if (quote || rem) { cur += String.fromCharCode(c); continue; }
    if (c === 0x3A && (listo & 4)) {
      cur += ':'; res.push(cur);
      cur = ' '.repeat(((listo & 1) ? 1 : 0) + ((listo & 8) ? 0 : 5));
      if (indent && (listo & 2)) cur += ' '.repeat(indent);
      continue;
    }
    if (c < 0x7F) { cur += String.fromCharCode(c); continue; }
    if (c === T.CONST) { cur += String(decodeLineNumber(body[i + 1], body[i + 2], body[i + 3])); i += 3; continue; }
    if (c === T.REM) rem = true;
    let name;
    if (c === T.ESCFN || c === T.ESCCOM || c === T.ESCSTMT) { name = tokenName(c, body[i + 1]); i++; } else name = tokenName(c);
    cur += lower ? name.toLowerCase() : name;
  }
  res.push(cur);
  return res;
}

/** Program -> text (TEXTSAVE / LIST with LISTO), one line per entry. */
export function programToText(lines, listo = 0) {
  return listProgram(lines, listo).join('\n') + '\n';
}
