// !T1ToFont conversion engine: a port of Sources/Printing/T1ToFont/c/type1 (converttype1), c/encoding,
// c/metrics (checkmetrics / writemetrics), c/convert (PC / Mac preprocessing) and the name guessing in
// c/frontend. Pure JavaScript (no DOM): the browser app and the node tests both use it.
//
//   const r = convertType1(bytes, { encoding, adobe, fontName, genAfm: true })
//        → { outlines: Uint8Array, encoding, genAfm: string|null, bboxesOK }
//   const m = makeIntMetrics(afmText, encoding, fontName, specials)   → Uint8Array
//
// Differences from the original are listed in docs/apps/T1ToFont.md (no scaffold / hint output).

export const FILETYPE_TYPE1 = 0xFF5, FILETYPE_MAC = 0xFC7, FILETYPE_PC = 0xFCB, FILETYPE_AFM = 0xFFF, FILETYPE_FONT = 0xFF6;
const CHUNKSIZE = 32, DESIGNSIZE = 1000, MAX_CHARS = 1024, NUM_OTHER_CHARS = 256, BIG = 0x10000000;
const ENC_CHECKED = 0, ENC_NOEXIST = 1, ENC_EXIST = 2;

/** An error carrying a Messages token + parameters (the app looks the text up). */
export class T1Error extends Error {
  constructor(token, ...args) { super(token + (args.length ? ' ' + args.join(' ') : '')); this.token = token; this.args = args; }
}

const latin1 = (bytes, a = 0, b = bytes.length) => { let s = ''; for (let i = a; i < b; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(b, i + 0x8000))); return s; };
const toBytes = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };

// ------------------------------------------------------------------------------------------ encodings
/** encstr: names by code, name lookup (first occurrence first), matchtable, alphabet. */
export class Encoding {
  constructor(name = '') { this.name = name; this.nchars = 0; this.nameof = []; this.matchtable = new Uint8Array(MAX_CHARS).fill(ENC_NOEXIST); this.alphabet = -1; this.byName = new Map(); }
  static leaf(name) { let n = name.startsWith('/') ? name.slice(1) : name; const i = n.lastIndexOf('.'); return i >= 0 && n !== '.notdef' ? n.slice(i + 1) : n; }
  addname(code, name) {
    const n = Encoding.leaf(name);
    const list = this.byName.get(n) ?? [];
    if (list.includes(code)) throw new T1Error('EncError2');
    list.push(code);
    this.byName.set(n, list);
    if (code >= 0 && code < MAX_CHARS) this.nameof[code] = n;
  }
  matchname(name) { const l = this.byName.get(Encoding.leaf(name)); return l ? l[0] : -1; }
  codesOf(name) { return this.byName.get(Encoding.leaf(name)) ?? []; }
  clone() { const e = new Encoding(this.name); Object.assign(e, this, { nameof: [...this.nameof], matchtable: this.matchtable.slice(), byName: new Map([...this.byName].map(([k, v]) => [k, [...v]])) }); return e; }
  /** writeencoding(): a simple encoding file. */
  toText() { let s = ''; for (let i = 0; i < this.nchars; i++) s += this.matchtable[i] === ENC_NOEXIST ? '/.notdef\n' : `/${this.nameof[i]}\n`; return s; }
}

/**
 * readencoding(): parse an encoding file. load(name) → Promise<string|null> fetches "<encoding dir><name>"
 * (e.g. "/Base0", "Specials.Adobe"); %%RISCOS_BasedOn n is followed when useBase.
 */
export async function readEncoding(encname, load, useBase = true) {
  let name = encname;
  for (let depth = 0; depth < 4; depth++) {
    const text = await load(name);
    if (text == null) throw new T1Error('FileOpenR', name);
    const enc = new Encoding(encname);
    let i = 0, basedOn = null;
    const lines = text.split(/\r?\n/);
    // tokenise like fscanf("%s "), but a '%' token swallows the rest of its line
    const words = [];
    for (const line of lines) {
      const ws = line.split(/[ \t]+/).filter(Boolean);
      for (let j = 0; j < ws.length; j++) {
        if (ws[j][0] === '%') {
          if (ws[j] === '%%RISCOS_Alphabet') words.push({ alpha: parseInt(ws[j + 1], 10) });
          else if (ws[j] === '%%RISCOS_BasedOn') words.push({ base: parseInt(ws[j + 1], 10) });
          break;
        }
        words.push(ws[j]);
      }
    }
    for (const w of words) {
      if (typeof w === 'object') {
        if ('alpha' in w) { if (Number.isNaN(w.alpha)) throw new T1Error('EncError'); enc.alphabet = w.alpha; }
        else if (useBase) { if (name.startsWith('/Base')) throw new T1Error('EncError'); basedOn = w.base; break; }
        continue;
      }
      if (i >= MAX_CHARS) throw new T1Error('EncError');
      if (w === '/.notdef' || w === '/.NotDef') { enc.matchtable[i] = ENC_NOEXIST; enc.nchars = i + 1; }
      else {
        if (w[0] !== '/') throw new T1Error('EncError');
        enc.matchtable[i] = enc.matchname(w) >= 0 ? ENC_CHECKED : ENC_EXIST;
        enc.addname(i, w.slice(1));
        enc.nchars = i + 1;
      }
      i++;
    }
    if (basedOn != null) { name = `/Base${basedOn}`; continue; }
    return enc;
  }
  throw new T1Error('EncError');
}

// ------------------------------------------------------------------------------------------ file formats
/** guesstype() (c/convert): plain Type 1, PC (PFB) or Mac resource format. */
export function guessType(b) {
  if (!b.length || b[0] === 0x25) return FILETYPE_TYPE1;
  if (b[0] === 128) return FILETYPE_PC;
  if (b.length >= 4) {
    const off = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    if (4 + off + 2 < b.length && b[4 + off + 2] === 0x25) return FILETYPE_MAC;
  }
  return FILETYPE_TYPE1;
}

/** preprocess_pc / preprocess_mac: segments → plain Type 1 text, binary sections as hex. */
export function preprocess(b, type = guessType(b)) {
  if (type === FILETYPE_TYPE1) return b;
  let out = '', lastBinary = false, position = 0;
  const ascii = (a, n) => { if (a + n > b.length) throw new T1Error(type === FILETYPE_PC ? 'PreProc2' : 'PreProc1'); if (lastBinary && position > 0) out += '\n'; lastBinary = false; position = 0; out += latin1(b, a, a + n).replace(/\r/g, '\n'); };
  const binary = (a, n) => {
    if (a + n > b.length) throw new T1Error(type === FILETYPE_PC ? 'PreProc2' : 'PreProc1');
    const tab = '0123456789abcdef';
    for (let i = 0; i < n; i++) { const c = b[a + i]; out += tab[c >> 4] + tab[c & 15]; if (++position === 32) { out += '\n'; position = 0; } }
    lastBinary = true;
  };
  if (type === FILETYPE_PC) {
    let p = 0;
    for (;;) {
      if (p + 2 > b.length) throw new T1Error('PreProc2');
      const seg = b[p + 1]; p += 2;
      if (seg === 3) break;
      const len = (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0; p += 4;
      if (seg === 1) ascii(p, len); else if (seg === 2) binary(p, len);
      if (seg === 1 || seg === 2) p += len;
    }
  } else {
    const be = (p) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
    let p = be(0);
    for (;;) {
      if (p + 6 > b.length) throw new T1Error('PreProc1');
      const len = be(p), t = b[p + 4]; p += 6;
      if (t === 5) break;
      if (t === 1) ascii(p, len - 2); else if (t === 2) binary(p, len - 2);
      p += len - 2;
    }
  }
  return toBytes(out);
}

/** getfontname() (c/frontend): the /FontName of a (plain, PC or Mac) Type 1 file, or null. */
export function getFontName(bytes) {
  const s = latin1(bytes, 0, Math.min(bytes.length, 65536));
  const i = s.indexOf('/FontName');
  if (i < 0) return null;
  const j = s.indexOf('/', i + 9);
  if (j < 0) return null;
  const m = /^[\x21-\xff]*/.exec(s.slice(j + 1));
  return m ? m[0] : null;
}

/** guess_acorn_fontname(): "Times-BoldItalic" → "Times.Bold.Italic" (each part ≤ 10 chars). */
export function guessAcornFontName(name, buflen = 256) {
  const isal = (c) => /[A-Za-z0-9]/.test(c), up = (c) => /[A-Z]/.test(c);
  let out = '', i = 0;
  while (i < name.length && out.length < buflen - 1) {
    const start = out.length; let seenlc = false;
    while (i < name.length && out.length < buflen - 2) {
      const c = name[i];
      if (!isal(c)) break;
      if (seenlc && up(c)) break;
      if (!up(c)) seenlc = true;
      out += c; i++;
    }
    if (out.length - start > 10) out = out.slice(0, start + 10);
    out += '.';
    while (i < name.length && !isal(name[i])) i++;
  }
  if (out.endsWith('.')) out = out.slice(0, -1);
  return out;
}

/** validatemetrics(): an AFM file starts "StartFontMetrics <n>". */
export function isAFM(bytes) {
  const s = latin1(bytes, 0, Math.min(bytes.length, 256)).split(/[\r\n]/)[0];
  return /^StartFontMetrics\s+[-+0-9.]/.test(s);
}

/** Does this look like a Type 1 font (any of the three formats)? */
export function isType1(bytes) {
  const t = guessType(bytes);
  if (t !== FILETYPE_TYPE1) return true;
  const s = latin1(bytes, 0, Math.min(bytes.length, 64));
  return /^%!(PS-AdobeFont|FontType1)/.test(s);
}

// ------------------------------------------------------------------------------------------ tokeniser
const TOK = { EOF: 0, BRACELEFT: 1, BRACERIGHT: 2, MARKLEFT: 3, MARKRIGHT: 4, STRING: 5, ID: 6, NUMBER: 7, NAME: 8, ERROR: 11 };
const isblank = (c) => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 0;
const ishex = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
const hexv = (c) => (c <= 57 ? c - 48 : (c | 32) - 87);
const DELIMS = new Set([...'()<>[]{}/%'].map((c) => c.charCodeAt(0)));
const isnamechar = (c) => c > 32 && c < 256 && !DELIMS.has(c);

/** CODEFILE: byte source with eexec decryption (hex or binary) and one byte of push-back. */
class CodeFile {
  constructor(bytes) { this.b = bytes; this.p = 0; this.eexec = false; this.hex = false; this.R = 0; this.keep = -1; this.last = -1; this.seenCharStrings = false; }
  raw() { return this.p < this.b.length ? this.b[this.p++] : -1; }
  eof() { return this.keep < 0 && this.p >= this.b.length; }
  getbyteEexec() {
    if (!this.eexec) return this.raw();
    let C = this.raw();
    if (this.hex) {
      while (C >= 0 && isblank(C)) C = this.raw();
      if (C < 0) return -1;
      let C2; do C2 = this.raw(); while (C2 >= 0 && isblank(C2));
      if (C2 < 0) return -1;
      C = (hexv(C) << 4) + hexv(C2);
    }
    const plain = (C ^ (this.R >> 8)) & 0xFF;
    this.R = ((C + this.R) * 52845 + 22719) & 0xFFFF;
    return plain;
  }
  getbyte() { if (this.keep >= 0) { this.last = this.keep; this.keep = -1; return this.last; } this.last = this.getbyteEexec(); return this.last; }
  repeatlast() { this.keep = this.last; }
  eexecStart() {
    let hex = true;
    for (let i = 0; i < 4; i++) if (!ishex(this.b[this.p + i] ?? 0)) hex = false;
    this.hex = hex; this.eexec = true; this.R = 55665;
    for (let i = 0; i < 4; i++) this.getbyteEexec();
  }
  /** Read a charstring / subr: nbytes of eexec'd data, decrypted with 4330, first lenIV (4) bytes dropped. */
  readCoded(n, lenIV = 4) {
    const out = [];
    let R = 4330;
    for (let i = 0; i < n; i++) {
      const C = this.getbyte();
      if (C < 0) break;
      if (lenIV < 0) { out.push(C); continue; }
      const plain = (C ^ (R >> 8)) & 0xFF;
      R = ((C + R) * 52845 + 22719) & 0xFFFF;
      if (i >= lenIV) out.push(plain);
    }
    return Uint8Array.from(out);
  }
  readName(first = '') {
    let s = first;
    for (;;) { const c = this.getbyte(); if (c < 0) break; if (!isnamechar(c)) { this.repeatlast(); break; } s += String.fromCharCode(c); }
    return s;
  }
  token() {
    for (;;) {
      const c = this.getbyte();
      if (c < 0) return { type: TOK.EOF };
      switch (c) {
        case 0x7B: return { type: TOK.BRACELEFT };
        case 0x7D: return { type: TOK.BRACERIGHT };
        case 0x5B: return { type: TOK.MARKLEFT };
        case 0x5D: return { type: TOK.MARKRIGHT };
        case 0x28: {   // (string)
          let s = '', depth = 1;
          for (;;) {
            let d = this.getbyte();
            if (d < 0) break;
            if (d === 0x5C) { d = this.getbyte(); s += String.fromCharCode(d); continue; }
            if (d === 0x28) depth++;
            if (d === 0x29 && --depth === 0) break;
            s += String.fromCharCode(d);
          }
          return { type: TOK.STRING, string: s };
        }
        case 0x2F: return { type: TOK.ID, string: this.readName() };
        case 0x25: while (!this.eof()) { const d = this.getbyte(); if (d === 10 || d === 13) break; } continue;
        default: break;
      }
      if ((c >= 48 && c <= 57) || c === 0x2D || c === 0x2B || c === 0x2E) {
        const s = this.readName(String.fromCharCode(c));
        const m = /^[-+]?(\d+#[0-9A-Za-z]+|\d*\.?\d*([eE][-+]?\d+)?)$/.exec(s);
        if (m && /\d/.test(s)) {
          let v;
          if (s.includes('#')) { const [r, d] = s.replace(/^[-+]/, '').split('#'); v = parseInt(d, +r) * (s[0] === '-' ? -1 : 1); } else v = Math.trunc(parseFloat(s));
          return { type: TOK.NUMBER, number: v, text: s };
        }
        return this.nameToken(s);
      }
      if (isblank(c)) continue;
      if (isnamechar(c)) {
        const s = this.readName(String.fromCharCode(c));
        if (s === 'eexec') { this.getbyte(); this.eexecStart(); continue; }
        if (this.seenCharStrings && s === 'closefile') { this.p = this.b.length; this.keep = -1; }
        return this.nameToken(s);
      }
      return { type: TOK.ERROR, string: String.fromCharCode(c) };
    }
  }
  nameToken(s) { return { type: TOK.NAME, string: s }; }
  number() { const t = this.token(); if (t.type !== TOK.NUMBER) throw new T1Error('T1Number'); return t; }
}

// ------------------------------------------------------------------------------------------ outlines
/**
 * converttype1(): parse a Type 1 font and build the Outlines file.
 * opts.encoding: Encoding for the output (null = "As specified in Type 1 file");
 * opts.adobe: the Adobe Standard Encoding (Specials.Adobe) for seac and the default;
 * opts.fontName: the RISC OS font name written into the file; opts.genAfm: produce the crude AFM (GENAFM);
 * opts.warn(token): called for "Using Adobe Standard Encoding".
 */
export function convertType1(input, opts) {
  const { adobe, fontName, genAfm = true, warn = () => {} } = opts;
  const flattenFlex = opts.flatten ?? true;          // the front end always passes DO_FLATTEN
  let enc = opts.encoding ? opts.encoding.clone() : null;
  const f = new CodeFile(preprocess(input));
  let priv = false, fontdirectory = false, seenSubrs = false, lenIV = 4;
  let subrs = [], chars = null, encchars = 0, otherchars = 0;
  const matrix = [1, 0, 0, 1, 0, 0];
  const afm = [];
  const topZones = [], bottomZones = [];
  const AFMFIELDS = { ItalicAngle: ['ItalicAngle', 'n'], isFixedPitch: ['IsFixedPitch', 's'], UnderlinePosition: ['UnderlinePosition', 'n'], UnderlineThickness: ['UnderlineThickness', 'n'], CapHeight: ['CapHeight', 'n'] };

  for (;;) {
    let t = f.token();
    if (t.type === TOK.EOF) break;
    if (t.type === TOK.NAME) { if (priv && t.string === 'FontDirectory') fontdirectory = true; continue; }
    if (t.type !== TOK.ID) continue;
    const id = t.string;
    if (id === 'Private') priv = true;
    else if (!fontdirectory && !enc && id === 'Encoding') {
      t = f.token();
      if (t.type === TOK.NUMBER) {
        const nchars = Math.min(t.number, MAX_CHARS);
        enc = new Encoding('fontspecific');
        for (;;) {
          t = f.token();
          if (t.type === TOK.EOF) break;
          if (t.type !== TOK.NAME) continue;
          if (t.string === 'readonly' || t.string === 'def') break;
          if (t.string === 'dup') {
            const code = f.number().number;
            t = f.token();
            if (t.type !== TOK.ID) throw new T1Error('EncError');
            if (code >= MAX_CHARS || t.string === '.notdef' || t.string === '.NotDef') continue;
            enc.matchtable[code] = enc.matchname(t.string) >= 0 ? ENC_CHECKED : ENC_EXIST;
            enc.addname(code, t.string);
            if (enc.nchars <= code) enc.nchars = code + 1;
          }
        }
        if (enc.nchars < nchars) enc.nchars = nchars;
      }
    } else if (id === 'lenIV' && !fontdirectory) {
      lenIV = f.number().number;
    } else if (id === 'Subrs') {
      const doit = !fontdirectory && !seenSubrs;
      if (doit) seenSubrs = true;
      const n = f.number().number;
      for (let i = 1; i <= n; i++) {
        do t = f.token(); while (t.type !== TOK.EOF && !(t.type === TOK.NAME && t.string === 'dup'));
        if (t.type === TOK.EOF) break;
        const subr = f.number().number, nbytes = f.number().number;
        f.token(); f.getbyte();                       // RD / -| and its terminator
        const code = f.readCoded(nbytes, lenIV);
        if (doit) subrs[subr] = code;
      }
    } else if (id === 'CharStrings') {
      t = f.token();
      if (t.type !== TOK.NUMBER) continue;
      const doit = !chars;
      f.seenCharStrings = true;
      if (doit) {
        if (!enc) { warn('AdobeEnc'); enc = adobe.clone(); }
        otherchars = encchars = enc.nchars;
        chars = [];
      }
      for (;;) {
        do t = f.token(); while (t.type !== TOK.EOF && !(t.type === TOK.NAME && t.string === 'end') && t.type !== TOK.ID);
        if (t.type !== TOK.ID) break;
        const charname = t.string;
        const c = enc.matchname(charname);
        const nbytes = f.number().number;
        f.token(); f.getbyte();
        const code = f.readCoded(nbytes, lenIV);
        if (!doit) continue;
        if (c >= 0) chars[c] = code;
        else if (otherchars < encchars + NUM_OTHER_CHARS) { enc.addname(otherchars, charname); chars[otherchars++] = code; }
      }
    } else if (!fontdirectory && id === 'BlueValues') {
      t = f.token(); if (t.type !== TOK.MARKLEFT) throw new T1Error('T1Bracket');
      const v = []; for (t = f.token(); t.type === TOK.NUMBER; t = f.token()) v.push(t.number);
      if (v.length >= 2) bottomZones.push({ overshoot: v[0], flat: v[1], base: true });
      for (let i = 2; i + 1 < v.length; i += 2) topZones.push({ flat: v[i], overshoot: v[i + 1] });
    } else if (!fontdirectory && id === 'OtherBlues') {
      t = f.token(); if (t.type !== TOK.MARKLEFT) throw new T1Error('T1Bracket');
      const v = []; for (t = f.token(); t.type === TOK.NUMBER; t = f.token()) v.push(t.number);
      for (let i = 0; i + 1 < v.length; i += 2) bottomZones.push({ flat: v[i], overshoot: v[i + 1] });
    } else if (!fontdirectory && id === 'FontMatrix') {
      f.token();
      for (let i = 0; i < 6; i++) { const n = f.number(); matrix[i] = parseFloat(n.text) * DESIGNSIZE; }
    } else if (genAfm && AFMFIELDS[id]) {
      const [afmName, kind] = AFMFIELDS[id];
      t = f.token();
      if (kind === 'n' && t.type === TOK.NUMBER) afm.push(`${afmName} ${t.text}`);
      else if (kind === 's' && (t.type === TOK.ID || t.type === TOK.NAME || t.type === TOK.STRING)) afm.push(`${afmName} ${t.string}`);
    }
  }
  if (!chars) { if (!enc) { warn('AdobeEnc'); enc = adobe.clone(); } encchars = otherchars = enc.nchars; chars = []; }
  void topZones; void bottomZones;

  const xformx = (x, y) => Math.trunc(x * matrix[0] + y * matrix[2] + matrix[4]);
  const xformy = (x, y) => Math.trunc(x * matrix[1] + y * matrix[3] + matrix[5]);

  // ---------------------------------------------------------------- charstring interpreter
  const outlines = new Array(encchars).fill(null);
  let segs, orgx, orgy, curx, cury, firstx, firsty, sidebx, sideby;
  let stack = [], ps = [], flexArgs = [], flexStartX = 0, flexStartY = 0, doingFlex = false, depth = 0;
  const addMoveto = (x, y) => segs.push({ type: 'M', x1: x, y1: y });
  const addLineto = (x, y, close) => segs.push({ type: close ? 'Z' : 'L', x1: x, y1: y });
  const rmoveto = (x, y) => { curx += x; cury += y; if (!doingFlex) { firstx = curx; firsty = cury; } };
  const rlineto = (x, y) => { if (curx === firstx && cury === firsty) addMoveto(curx, cury); curx += x; cury += y; addLineto(curx, cury, false); };
  const rcurveto = (x1, y1, x2, y2, x3, y3) => {
    if (curx === firstx && cury === firsty) addMoveto(curx, cury);
    segs.push({ type: 'C', x1: curx + x1, y1: cury + y1, x2: curx + x2, y2: cury + y2, x3: curx + x3, y3: cury + y3 });
    curx += x3; cury += y3;
  };
  const closepath = () => { if (curx !== firstx || cury !== firsty) addLineto(firstx, firsty, true); };
  const sbw = (sbx, sby, wx, wy) => { sidebx = curx = orgx + sbx; sideby = cury = orgy + sby; segs.push({ type: 'W', x1: wx, y1: wy }); };
  const flexend = (height, finalx, finaly) => {
    void height;
    curx = flexStartX; cury = flexStartY;
    const a = flexArgs;
    if (flattenFlex) rlineto((a[6] ?? 0) + (a[12] ?? 0), (a[7] ?? 0) + (a[13] ?? 0));
    else { rcurveto(a[2], a[3], a[4], a[5], a[6], a[7]); rcurveto(a[8], a[9], a[10], a[11], a[12], a[13]); }
    ps.push(finaly, finalx);
    doingFlex = false;
  };
  const seac = (asb, adx, ady, bchar, achar) => {
    const aname = adobe.nameof[achar], bname = adobe.nameof[bchar];
    const adjust = asb - (sidebx - orgx);
    if (!aname || !bname) throw new T1Error('T1Accent');
    const aindex = enc.matchname(aname), bindex = enc.matchname(bname);
    if (aindex < 0 || bindex < 0) return;
    if (bindex >= encchars) {
      orgx = curx = firstx = sidebx = sideby = orgy = cury = firsty = 0;
      exec(chars[bindex]);
      if (segs.length && segs[segs.length - 1].type !== 'E') segs.push({ type: 'E' });
    }
    if (aindex >= encchars) {
      orgx = curx = firstx = adx; orgy = cury = firsty = ady; sidebx = sideby = 0;
      exec(chars[aindex]);
    }
    let count = 0;
    if (bindex < encchars) segs.push({ type: 'I', code: bindex, x1: 0, y1: 0, n: count++ });
    if (aindex < encchars) segs.push({ type: 'I', code: aindex, x1: adx - adjust, y1: ady, n: count++ });
  };
  const arg = (i) => stack[i] ?? 0;
  function exec(code) {
    if (!code) return;
    if (++depth > 64) { depth--; throw new T1Error('T1Illegal'); }
    try {
      let p = 0;
      while (p < code.length) {
        const v = code[p++];
        if (v >= 32) {
          let n;
          if (v < 247) n = v - 139;
          else if (v < 251) n = ((v - 247) << 8) + code[p++] + 108;
          else if (v < 255) n = -((v - 251) << 8) - code[p++] - 108;
          else { n = (code[p] << 24) | (code[p + 1] << 16) | (code[p + 2] << 8) | code[p + 3]; p += 4; }
          stack.push(n);
          continue;
        }
        const op = v === 12 ? 32 + code[p++] : v;
        switch (op) {
          case 1: case 3: case 32: stack = []; break;                         // hstem, vstem, dotsection (hints ignored)
          case 33: case 34: stack = []; break;                                // vstem3, hstem3
          case 4: rmoveto(0, arg(0)); stack = []; break;                      // vmoveto
          case 5: rlineto(arg(0), arg(1)); stack = []; break;
          case 6: rlineto(arg(0), 0); stack = []; break;
          case 7: rlineto(0, arg(0)); stack = []; break;
          case 8: { const x1 = arg(0), y1 = arg(1), x2 = x1 + arg(2), y2 = y1 + arg(3), x3 = x2 + arg(4), y3 = y2 + arg(5); rcurveto(x1, y1, x2, y2, x3, y3); stack = []; break; }
          case 9: closepath(); stack = []; break;
          case 10: { const s = stack.pop(); exec(subrs[s]); break; }          // callsubr
          case 11: return;                                                    // return
          case 13: sbw(arg(0), 0, arg(1), 0); stack = []; break;              // hsbw
          case 14: segs.push({ type: 'E' }); stack = []; break;               // endchar
          case 21: rmoveto(arg(0), arg(1)); stack = []; break;
          case 22: rmoveto(arg(0), 0); stack = []; break;
          case 30: { const y1 = arg(0), x2 = arg(1), y2 = y1 + arg(2), x3 = x2 + arg(3); rcurveto(0, y1, x2, y2, x3, y2); stack = []; break; }
          case 31: { const x1 = arg(0), x2 = x1 + arg(1), y2 = arg(2), y3 = y2 + arg(3); rcurveto(x1, 0, x2, y2, x2, y3); stack = []; break; }
          case 38: { const a = stack.slice(0, 5); stack = []; seac(...a); break; }
          case 39: sbw(arg(0), arg(1), arg(2), arg(3)); stack = []; break;
          case 44: { const b = stack.pop(), a = stack.pop(); stack.push(b ? Math.trunc(a / b) : 0); break; }   // div
          case 48: {                                                          // callothersubr
            const s = stack.pop(), n = stack.pop() ?? 0;
            for (let i = 0; i < n; i++) ps.push(stack.pop());
            if (s === 1) { flexStartX = curx; flexStartY = cury; flexArgs = []; doingFlex = true; }
            else if (s === 2) {
              let rx = flexStartX, ry = flexStartY;
              if (flexArgs.length >= 8) { rx += flexArgs[6]; ry += flexArgs[7]; }
              flexArgs.push(curx - rx, cury - ry);
            } else if (s === 0) { const a1 = ps.pop(), a2 = ps.pop(), a3 = ps.pop(); flexend(a1, a2, a3); }
            // 3 = hint replacement: the subr number stays on the PostScript stack for "pop callsubr"
            break;
          }
          case 49: stack.push(ps.pop() ?? 0); break;                          // pop
          case 65: curx = orgx + arg(0); cury = orgy + arg(1); stack = []; break;   // setcurrentpoint
          default: throw new T1Error('T1Illegal');
        }
      }
    } finally { depth--; }
  }

  for (let code = 0; code < encchars; code++) {
    let src = code;
    const m = enc.matchtable[code];
    if (m === ENC_NOEXIST) continue;
    if (m === ENC_CHECKED) src = enc.matchname(enc.nameof[code]);
    if (!chars[src]) continue;
    segs = []; stack = []; ps = []; flexArgs = []; doingFlex = false;
    orgx = orgy = curx = cury = firstx = firsty = sidebx = sideby = 0;
    exec(chars[src]);
    outlines[code] = segs;
  }

  // ---------------------------------------------------------------- bounding boxes (Draw_FlattenPath equivalent)
  const bboxOf = (code) => {
    const b = { x0: BIG, y0: BIG, x1: -BIG, y1: -BIG };
    let any = false;
    const add = (x, y) => { x = Math.round(x); y = Math.round(y); any = true; if (x < b.x0) b.x0 = x; if (y < b.y0) b.y0 = y; if (x > b.x1) b.x1 = x; if (y > b.y1) b.y1 = y; };
    const walk = (list, ox, oy, lvl) => {
      let px = 0, py = 0;
      for (const s of list ?? []) {
        if (s.type === 'M' || s.type === 'L' || s.type === 'Z') {
          px = xformx(s.x1 + ox, s.y1 + oy); py = xformy(s.x1 + ox, s.y1 + oy); add(px, py);
        } else if (s.type === 'C') {
          const P = [[px, py], [xformx(s.x1 + ox, s.y1 + oy), xformy(s.x1 + ox, s.y1 + oy)], [xformx(s.x2 + ox, s.y2 + oy), xformy(s.x2 + ox, s.y2 + oy)], [xformx(s.x3 + ox, s.y3 + oy), xformy(s.x3 + ox, s.y3 + oy)]];
          for (let i = 1; i <= 16; i++) {
            const t = i / 16, u = 1 - t;
            add(u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0],
              u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]);
          }
          for (const k of [0, 1]) {   // exact extrema
            const a = -P[0][k] + 3 * P[1][k] - 3 * P[2][k] + P[3][k], bq = 2 * (P[0][k] - 2 * P[1][k] + P[2][k]), c = P[1][k] - P[0][k];
            const roots = Math.abs(a) < 1e-9 ? (Math.abs(bq) > 1e-9 ? [-c / bq] : []) : (() => { const d = bq * bq - 4 * a * c; if (d < 0) return []; const r = Math.sqrt(d); return [(-bq + r) / (2 * a), (-bq - r) / (2 * a)]; })();
            for (const t of roots) if (t > 0 && t < 1) {
              const u = 1 - t;
              add(u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0],
                u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]);
            }
          }
          px = P[3][0]; py = P[3][1];
        } else if (s.type === 'I' && lvl < 4) walk(outlines[s.code], ox + s.x1, oy + s.y1, lvl + 1);
      }
    };
    walk(outlines[code], 0, 0, 0);
    if (!any) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    return b;
  };

  // ---------------------------------------------------------------- write the Outlines file (version 8)
  const out = new Writer();
  const nchunks = Math.ceil(encchars / CHUNKSIZE);
  const ndepbytes = Math.ceil(nchunks / 32) * 4;
  out.str('FONT'); out.u8(0); out.u8(8); out.u16(DESIGNSIZE);
  out.u16(0); out.u16(0); out.u16(DESIGNSIZE); out.u16(DESIGNSIZE);
  const indexstart = out.pos;
  const scafindexsize = 1;                        // no scaffold data (hints are not converted)
  out.u32(0); out.u32(nchunks); out.u32(scafindexsize); out.u32(1 | 4);
  for (let i = 0; i < 5; i++) out.u32(0);
  const tablestart = out.pos;
  out.u16(0xFFFF);
  out.u8(0);                                      // skeleton threshold
  out.patch16(tablestart, out.pos - tablestart);
  out.str(fontName); out.u8(0); out.str('Outlines'); out.u8(0);
  out.align();
  out.patch32(indexstart, out.pos);
  const chunkIndexAt = out.pos;
  out.pos += (nchunks + 1) * 4;
  let chunkstart = out.pos;
  const chunkindex = [chunkstart];
  let fb = { x0: BIG, y0: BIG, x1: -BIG, y1: -BIG }, bboxesOK = true;
  const afmChars = [];
  const widthOf = (segsList) => { const w = (segsList ?? []).find((s) => s.type === 'W'); return w ? [xformx(w.x1, 0), xformy(0, w.y1)] : [0, 0]; };

  for (let chunk = 0; chunk < nchunks; chunk++) {
    // spotDependencies
    const dep = new Uint8Array(ndepbytes); let ndeps = 0;
    for (let c = chunk * CHUNKSIZE; c < Math.min(encchars, chunk * CHUNKSIZE + CHUNKSIZE); c++) {
      for (const s of outlines[c] ?? []) if (s.type === 'I') { const tc = (s.code / CHUNKSIZE) | 0; dep[tc >> 3] |= 1 << (tc & 7); ndeps++; }
    }
    let charstart = chunkstart + 4 + CHUNKSIZE * 4 + (ndeps ? ndepbytes : 0);
    const marker = charstart;
    out.pos = charstart;
    const charindex = new Array(CHUNKSIZE).fill(0);
    for (let n = 0; n < CHUNKSIZE; n++) {
      const code = chunk * CHUNKSIZE + n;
      if (code < encchars && outlines[code]) {
        const bbox = bboxOf(code);
        writeChar(out, outlines[code], bbox, xformx, xformy);
        if (bbox.x0 < fb.x0) fb.x0 = bbox.x0; if (bbox.y0 < fb.y0) fb.y0 = bbox.y0;
        if (bbox.x1 > fb.x1) fb.x1 = bbox.x1; if (bbox.y1 > fb.y1) fb.y1 = bbox.y1;
        if (genAfm) { const [wx] = widthOf(outlines[code]); afmChars.push(`C ${code} ; WX ${wx} ; N ${enc.nameof[code]} ; B ${bbox.x0} ${bbox.y0} ${bbox.x1} ${bbox.y1}`); }
        charindex[n] = charstart - chunkstart - 4;
        charstart = out.pos;
      } else if (code !== 0) {                    // NO_NULL_CHARS: an empty glyph
        out.u8(0x9); out.xy(0, 0); out.xy(0, 0); out.u8(0);
        charindex[n] = charstart - chunkstart - 4;
        charstart = out.pos;
        if (0 < fb.x0) fb.x0 = 0; if (0 < fb.y0) fb.y0 = 0; if (0 > fb.x1) fb.x1 = 0; if (0 > fb.y1) fb.y1 = 0;
      }
    }
    out.align();
    charstart = out.pos;
    if (charstart > marker) {
      out.pos = chunkstart;
      out.u32((0x80000000 | (ndeps ? 0x80 : 0)) >>> 0);
      for (const o of charindex) out.u32(o);
      if (ndeps) out.bytes(dep);
      out.pos = charstart;
      chunkstart = charstart;
    }
    chunkindex.push(chunkstart);
  }
  out.pos = out.len;
  if (fb.x0 === BIG) fb = { x0: 0, y0: 0, x1: 0, y1: 0 };
  out.patch16(8, fb.x0); out.patch16(10, fb.y0); out.patch16(12, fb.x1 - fb.x0); out.patch16(14, fb.y1 - fb.y0);
  for (let i = 0; i <= nchunks; i++) out.patch32(chunkIndexAt + i * 4, chunkindex[i]);
  const genAfmText = genAfm ? [...afm, ...afmChars, `FontBBox ${fb.x0} ${fb.y0} ${fb.x1} ${fb.y1}`].join('\n') + '\n' : null;
  return { outlines: out.result(), encoding: enc, genAfm: genAfmText, bboxesOK, nchars: encchars };
}

/** outputCharData(): one character (composite base+accent, or paths + inclusions). */
function writeChar(out, list, bbox, xformx, xformy) {
  let need16 = false, composite = true;
  const inc = [];
  for (const s of list) {
    if (s.type === 'M' || s.type === 'L' || s.type === 'C' || s.type === 'Z') composite = false;
    else if (s.type === 'I') { if (s.code > 255) need16 = true; inc.push(s); }
  }
  if (inc.length < 1 || inc.length > 2) composite = false;
  const code = (c) => (need16 ? out.u16(c) : out.u8(c));
  if (composite) {
    out.u8(0x9 | (need16 ? 0x40 : 0) | 0x10 | (inc.length === 2 ? 0x20 : 0));
    code(inc[0].code);
    if (inc.length === 2) { code(inc[1].code); out.xy(xformx(inc[1].x1, inc[1].y1), xformy(inc[1].x1, inc[1].y1)); }
    return;
  }
  out.u8(0x9 | (need16 ? 0x40 : 0));
  out.xy(bbox.x0, bbox.y0); out.xy(bbox.x1 - bbox.x0, bbox.y1 - bbox.y0);
  for (const s of list) {
    switch (s.type) {
      case 'M': out.u8(1); out.xy(xformx(s.x1, s.y1), xformy(s.x1, s.y1)); break;
      case 'L': case 'Z': out.u8(2); out.xy(xformx(s.x1, s.y1), xformy(s.x1, s.y1)); break;
      case 'C': out.u8(3); out.xy(xformx(s.x1, s.y1), xformy(s.x1, s.y1)); out.xy(xformx(s.x2, s.y2), xformy(s.x2, s.y2)); out.xy(xformx(s.x3, s.y3), xformy(s.x3, s.y3)); break;
      case 'I': if (s.n === 0) out.u8(0x08); code(s.code); out.xy(xformx(s.x1, s.y1), xformy(s.x1, s.y1)); break;
      default: break;
    }
  }
  out.u16(0);
}

/** Growable little-endian byte writer with random access (the C code's fseek/ftell). */
class Writer {
  constructor() { this.buf = new Uint8Array(4096); this.pos = 0; this.len = 0; }
  ensure(n) { if (n > this.buf.length) { const b = new Uint8Array(Math.max(n, this.buf.length * 2)); b.set(this.buf); this.buf = b; } }
  u8(v) { this.ensure(this.pos + 1); this.buf[this.pos++] = v & 255; if (this.pos > this.len) this.len = this.pos; }
  u16(v) { this.u8(v); this.u8(v >> 8); }
  u32(v) { this.u8(v); this.u8(v >> 8); this.u8(v >> 16); this.u8(v >>> 24); }
  xy(x, y) { this.u8(x); this.u8(((x >> 8) & 0x0F) | ((y << 4) & 0xF0)); this.u8(y >> 4); }   // fput3
  str(s) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); }
  bytes(b) { for (const v of b) this.u8(v); }
  align() { while (this.pos & 3) this.u8(0); }
  patch16(at, v) { const p = this.pos; this.pos = at; this.u16(v); this.pos = p; }
  patch32(at, v) { const p = this.pos; this.pos = at; this.u32(v); this.pos = p; }
  result() { return this.buf.slice(0, this.len); }
}

// ------------------------------------------------------------------------------------------ metrics
const FLG = { NOBBOXES: 1, NOXOFFSETS: 2, NOYOFFSETS: 4, KERNS: 8, CHARMAPSIZED: 32, BIT16KERNS: 64 };

/**
 * checkmetrics(DO_MAKE | DO_KERNS) + writemetrics(): IntMetrics from an AFM text (the user's, or the
 * crude one convertType1 generates). specials = {dummies, up, down} Encodings (Specials.*).
 */
export function makeIntMetrics(afmText, encIn, fontName, specials = {}) {
  const enc = encIn.clone();
  const M = { nchars: 0, ncodes: enc.nchars, x0: [], y0: [], x1: [], y1: [], xw: [], yw: [], charmap: new Array(MAX_CHARS).fill(0),
    italicshear: 0, ulpos: 0, ulthick: 0, bbox: [0, 0, 0, 0], cap: 0, xh: 0, desc: 0, asc: 0, kerns: new Map(), nkerns: 0 };
  const addmetric = (charno, x0, y0, x1, y1, xw, yw) => {
    const n = M.nchars++;
    M.x0[n] = x0; M.y0[n] = y0; M.x1[n] = x1; M.y1[n] = y1; M.xw[n] = xw; M.yw[n] = yw;
    if (charno < MAX_CHARS) M.charmap[charno] = n;
  };
  const addkern = (n1, n2, x, y) => {
    for (const c1 of enc.codesOf(n1)) for (const c2 of enc.codesOf(n2)) {
      if (c1 >= MAX_CHARS) continue;
      const l = M.kerns.get(c1) ?? []; l.unshift({ letter: c2, x, y }); M.kerns.set(c1, l); M.nkerns++;
    }
  };
  let design = 1000, fixed = false;
  const sc = (v) => Math.trunc(v * 1000 / design);
  for (const line of String(afmText).split(/\r\n?|\n/)) {
    let m;
    if ((m = /^DesignSize\s+(-?\d+)/.exec(line))) design = +m[1] || 1000;
    else if ((m = /^ItalicAngle\s+([-+]?[\d.]+)/.exec(line))) M.italicshear = Math.trunc(-1000 * Math.tan(parseFloat(m[1]) * 3.1415926 / 180));
    else if ((m = /^IsFixedPitch\s+(\S+)/.exec(line))) fixed = m[1] === 'true';
    else if ((m = /^UnderlinePosition\s+(-?\d+)/.exec(line))) M.ulpos = Math.trunc(+m[1] * 256 / design);
    else if ((m = /^UnderlineThickness\s+(-?\d+)/.exec(line))) M.ulthick = Math.trunc(+m[1] * 256 / design);
    else if ((m = /^FontBBox\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/.exec(line))) M.bbox = [sc(+m[1]), sc(+m[2]), sc(+m[3]), sc(+m[4])];
    else if ((m = /^CapHeight\s+(-?\d+)/.exec(line))) M.cap = sc(+m[1]);
    else if ((m = /^XHeight\s+(-?\d+)/.exec(line))) M.xh = sc(+m[1]);
    else if ((m = /^Descender\s+(-?\d+)/.exec(line))) M.desc = sc(+m[1]);
    else if ((m = /^Ascender\s+(-?\d+)/.exec(line))) M.asc = sc(+m[1]);
    else if ((m = /^KPX\s+(\S+)\s+(\S+)\s+(-?\d+)/.exec(line))) addkern(m[1], m[2], sc(+m[3]), 0);
    else if ((m = /^KPY\s+(\S+)\s+(\S+)\s+(-?\d+)/.exec(line))) addkern(m[1], m[2], 0, sc(+m[3]));
    else if ((m = /^KP\s+(\S+)\s+(\S+)\s+(-?\d+)\s+(-?\d+)/.exec(line))) addkern(m[1], m[2], sc(+m[3]), sc(+m[4]));
    else if ((m = /^C\s+(-?\d+)\s*;\s*WX\s+(-?\d+)\s*;\s*N\s+(\S+)\s*;\s*B\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/.exec(line))) {
      const [, , wid, name, a, b, c, d] = m;
      for (const code of enc.codesOf(name)) {
        if (code < MAX_CHARS) enc.matchtable[code] = ENC_CHECKED;
        addmetric(code, sc(+a), sc(+b), sc(+c), sc(+d), sc(+wid), 0);
      }
    }
  }
  // characters not in the AFM file: composites (base + accent) and "dummy" alternates
  for (let i = 0; i < MAX_CHARS; i++) {
    if (enc.matchtable[i] !== ENC_EXIST) continue;
    const { base, accent } = splitComposite(enc, i, specials);
    if (base < 0) continue;
    const cb = M.charmap[base];
    let x0 = M.x0[cb], y0 = M.y0[cb], x1 = M.x1[cb], y1 = M.y1[cb];
    if (accent >= 0) {
      const ca = M.charmap[accent];
      if (x0 > M.x0[ca]) x0 = M.x0[ca]; if (y0 > M.y0[ca]) y0 = M.y0[ca];
      if (x1 < M.x1[ca]) x1 = M.x1[ca]; if (y1 < M.y1[ca]) y1 = M.y1[ca];
    }
    addmetric(i, x0, y0, x1, y1, M.xw[cb], M.yw[cb]);
  }

  let flags = FLG.KERNS, defx = 0, defy = 0;
  flags |= FLG.NOXOFFSETS | FLG.NOYOFFSETS;
  for (let i = 0; i < M.nchars; i++) {
    if (fixed) { if (defx === 0) defx = M.xw[i]; if (defy === 0) defy = M.yw[i]; }
    if (M.xw[i] !== defx) flags &= ~FLG.NOXOFFSETS;
    if (M.yw[i] !== defy) flags &= ~FLG.NOYOFFSETS;
  }
  for (const l of M.kerns.values()) for (const k of l) { if (k.x) flags &= ~FLG.NOXOFFSETS; if (k.y) flags &= ~FLG.NOYOFFSETS; }
  if (M.nkerns) flags = (flags | FLG.KERNS) & ~FLG.BIT16KERNS; else flags &= ~(FLG.KERNS | FLG.BIT16KERNS);
  if (flags !== 0) flags |= FLG.KERNS;
  const FIXED = FLG.NOXOFFSETS | FLG.NOYOFFSETS;

  // common up identical entries (never moving entry 0)
  if ((flags & FIXED) !== FIXED) {
    let nchars = M.nchars, head = -1, tailRef = { set: (v) => { head = v; } };
    for (let i = nchars - 1; i >= 0; i--) {
      for (let j = i - 1; j >= 0; j--) {
        if (((flags & FLG.NOXOFFSETS) || M.xw[i] === M.xw[j]) && ((flags & FLG.NOYOFFSETS) || M.yw[i] === M.yw[j])
          && M.x0[i] === M.x0[j] && M.y0[i] === M.y0[j] && M.x1[i] === M.x1[j] && M.y1[i] === M.y1[j]) {
          for (let k = 0; k < M.ncodes; k++) if (M.charmap[k] === i) M.charmap[k] = j;
          M.xw[i] = -1;
          tailRef.set(i);
          const ii = i; tailRef = { set: (v) => { M.xw[ii] = v; } };
          break;
        }
      }
    }
    for (let i = head, j; i >= 0; i = j) {
      j = M.xw[i];
      if (i !== --nchars) {
        M.xw[i] = M.xw[nchars]; M.yw[i] = M.yw[nchars];
        M.x0[i] = M.x0[nchars]; M.y0[i] = M.y0[nchars]; M.x1[i] = M.x1[nchars]; M.y1[i] = M.y1[nchars];
        for (let k = 0; k < M.ncodes; k++) if (M.charmap[k] === nchars) M.charmap[k] = i;
      }
    }
    M.nchars = nchars;
  }

  // writemetrics()
  let nchars = M.nchars, charmapsize, chmap = [];
  if ((flags & FIXED) === FIXED) { flags |= FLG.CHARMAPSIZED; charmapsize = 0; nchars = 0; }
  else if (M.ncodes > 256) {
    flags |= FLG.CHARMAPSIZED;
    if (nchars > 256) { charmapsize = 0; nchars = M.ncodes; for (let i = 0; i < nchars; i++) chmap[i] = M.charmap[i]; }
    else { charmapsize = M.ncodes; for (let i = 0; i < nchars; i++) chmap[i] = i; }
  } else { flags &= ~FLG.CHARMAPSIZED; charmapsize = 256; for (let i = 0; i < nchars; i++) chmap[i] = i; }
  const version = flags ? 2 : 0;
  const w = new Writer();
  w.str(fontName.slice(0, 40));
  while (w.pos < 40) w.u8(0x0D);
  w.u32(16); w.u32(16);
  w.u8(nchars & 0xFF); w.u8(version); w.u8(flags); w.u8(nchars >> 8);
  if (flags & FLG.CHARMAPSIZED) w.u16(charmapsize);
  for (let i = 0; i < charmapsize; i++) w.u8(M.charmap[i]);
  for (const a of [M.x0, M.y0, M.x1, M.y1]) for (let i = 0; i < nchars; i++) w.u16(a[chmap[i]] ?? 0);
  if (!(flags & FLG.NOXOFFSETS)) for (let i = 0; i < nchars; i++) w.u16(M.xw[chmap[i]] ?? 0);
  if (!(flags & FLG.NOYOFFSETS)) for (let i = 0; i < nchars; i++) w.u16(M.yw[chmap[i]] ?? 0);
  if (flags & FLG.KERNS) {
    const t0 = w.pos; w.pos += 8; w.len = Math.max(w.len, w.pos); w.ensure(w.pos);
    const table = [w.pos - t0];
    for (const v of M.bbox) w.u16(v);
    w.u16(defx); w.u16(defy); w.u16(M.italicshear); w.u8(M.ulpos); w.u8(M.ulthick);
    w.u16(M.cap); w.u16(M.xh); w.u16(M.desc); w.u16(M.asc); w.u32(0);
    table.push(w.pos - t0);
    if (M.nkerns) {
      let k16 = false;
      for (const [l1, l] of M.kerns) if (l.length && (l1 >= 256 || l[0].letter >= 256)) k16 = true;
      if (k16) { flags |= FLG.BIT16KERNS; w.buf[50] = flags; }   // (the original left the header flag clear)
      const code = (c) => (k16 ? w.u16(c) : w.u8(c));
      for (const l1 of [...M.kerns.keys()].sort((a, b) => a - b)) {
        code(l1);
        for (const k of M.kerns.get(l1)) { code(k.letter); if (!(flags & FLG.NOXOFFSETS)) w.u16(k.x); if (!(flags & FLG.NOYOFFSETS)) w.u16(k.y); }
        code(0);
      }
      code(0);
    }
    table.push(w.pos - t0, w.pos - t0);
    table.forEach((v, i) => w.patch16(t0 + i * 2, v));
  }
  return w.result();
}

/** splitcomposite() with the Specials.Dummies / Accents_Up / Accents_Dn lists (offsets as the original: 0). */
function splitComposite(enc, ch, { dummies, up, down } = {}) {
  const name = enc.nameof[ch];
  if (!name) return { base: -1, accent: -1 };
  for (const list of [dummies]) {
    if (!list) continue;
    for (let i = 0; i < list.nchars; i++) {
      if (list.matchtable[i] === ENC_NOEXIST) continue;
      const d = list.nameof[i], bl = name.length - d.length;
      if (bl > 0 && name.endsWith(d)) { const b = enc.matchname(name.slice(0, bl)); if (b >= 0) return { base: b, accent: -1 }; }
    }
  }
  for (const [list, upward] of [[up, true], [down, false]]) {
    if (!list) continue;
    for (let i = 0; i < list.nchars; i++) {
      if (list.matchtable[i] === ENC_NOEXIST) continue;
      const a = list.nameof[i], bl = name.length - a.length;
      if (bl > 0 && name.endsWith(a)) {
        let b = name.slice(0, bl);
        if (upward && b === 'i') b = 'dotlessi';
        if (upward && b === 'j') b = 'dotlessj';
        const base = enc.matchname(b);
        if (base >= 0) return { base, accent: enc.matchname(a) };
      }
    }
  }
  return { base: -1, accent: -1 };
}

/** getfontfilename(): "Outlines" / "IntMetrics" with the alphabet number squeezed into 10 characters. */
export function fontFileLeaf(leaf, alphabet) {
  if (alphabet < 0) return leaf;
  const num = String(alphabet);
  const excess = Math.max(0, leaf.length + num.length - 10);
  return leaf.slice(0, leaf.length - excess) + num;
}
