// !JsEdit modes: how each kind of file is coloured, indented and completed. As in StrongED, a mode is a text
// file (in <JsEdit$Dir>.Modes, so users can read, change and add them) of one directive per line:
//
//   | comment
//   Name       JavaScript
//   Lexer      c-like | basic | obey | text           how the text is split into tokens (lexers below)
//   Types      &F81 &FFF                              file types that use this mode
//   Indent     2                                      spaces per indentation step
//   Comment    //                                     comment to the end of the line ("Comment" for the menu)
//   Block      /* */                                  block comment
//   Quotes     ' " `                                  string quotes (c-like: ` is a template string)
//   Keywords   if else ...                            words coloured as keywords (several lines add up)
//   Constants  true false ...
//   Api        task print ...                         the desktop's programming interface
//   Functions  <regular expression>                   finds definitions for the Functions list (group 1)
//   Colour     keyword 8 bold                         a token class's Wimp colour (0-15), optionally bold
//   Complete   task.every(ms, fn) Call fn every ms ms  completions: name, (arguments), description
//
// Token classes: text, comment, string, number, keyword, constant, api, regex, punct, lineno, command, variable.

import { TOKEN_NAMES, STMT_NAMES, FN_NAMES } from '../../basic/tokens.js';

export const CLASSES = ['text', 'comment', 'string', 'number', 'keyword', 'constant', 'api', 'regex', 'punct', 'lineno', 'command', 'variable'];
export const C = Object.fromEntries(CLASSES.map((c, i) => [c, i]));

const DEFAULT_COLOURS = {
  text: [7], comment: [4], string: [13], number: [11], keyword: [8, true], constant: [11], api: [14],
  regex: [14], punct: [7], lineno: [5], command: [8, true], variable: [7],
};

/** Parse a mode file. */
export function parseMode(text) {
  const m = {
    name: 'Text', lexer: 'text', types: [], indent: 2, comment: null, block: null, quotes: [],
    keywords: new Set(), constants: new Set(), api: new Set(), functions: [], complete: [],
    colours: Object.fromEntries(Object.entries(DEFAULT_COLOURS).map(([k, v]) => [k, { colour: v[0], bold: !!v[1] }])),
  };
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || /^\s*\|/.test(line)) continue;
    const mm = /^\s*(\S+)\s*(.*)$/.exec(line);
    const key = mm[1].toLowerCase(), rest = mm[2].trim(), words = rest.split(/\s+/).filter(Boolean);
    switch (key) {
      case 'name': m.name = rest; break;
      case 'lexer': m.lexer = rest.toLowerCase(); break;
      case 'types': m.types.push(...words.map((w) => parseInt(w.replace(/^&/, ''), 16)).filter((n) => !Number.isNaN(n))); break;
      case 'indent': m.indent = Math.max(1, parseInt(rest, 10) || 2); break;
      case 'comment': m.comment = rest; break;
      case 'block': m.block = words.length >= 2 ? [words[0], words[1]] : null; break;
      case 'quotes': m.quotes.push(...words); break;
      case 'keywords': for (const w of words) m.keywords.add(w); break;
      case 'constants': for (const w of words) m.constants.add(w); break;
      case 'api': for (const w of words) m.api.add(w); break;
      case 'functions': try { m.functions.push(new RegExp(rest)); } catch { /* bad pattern: ignored */ } break;
      case 'colour': case 'color': {
        const [cls, n, style] = words;
        if (cls in m.colours) m.colours[cls] = { colour: Math.max(0, Math.min(15, parseInt(n, 10) || 0)), bold: /^bold$/i.test(style ?? '') };
        break;
      }
      case 'complete': {
        const c = /^([A-Za-z_$][\w$.]*)(\([^)]*\))?\s*(.*)$/.exec(rest);
        if (c) m.complete.push({ name: c[1], args: c[2] ?? '', about: c[3] ?? '' });
        break;
      }
      default: break;
    }
  }
  m.lex = LEXERS[m.lexer] ?? LEXERS.text;
  return m;
}

// ---------------------------------------------------------------------------------- lexers
// lex(mode, line, state) -> { cls: Uint8Array(line.length), state } for one line (without its newline).
// state is a string (so "has the state at the end of this line changed?" is a simple comparison); '' = normal.

const isIdStart = (c) => /[A-Za-z_$\xc0-\xff]/.test(c);
const isId = (c) => /[\w$\xc0-\xff]/.test(c);
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/** C-like languages (JavaScript, JSON, C): comments, strings, template strings with ${...}, numbers, regexes. */
function lexCLike(mode, line, state) {
  const n = line.length, cls = new Uint8Array(n);
  const fill = (a, b, c) => { for (let k = a; k < b && k < n; k++) cls[k] = c; };
  // state: 'B' inside a block comment, else a stack of T (in a template) / E<depth> (in ${...})
  let block = state === 'B';
  const stack = block || !state ? [] : state.split(',').map((s) => (s === 'T' ? { t: 'T' } : { t: 'E', d: +s.slice(1) }));
  const [bOpen, bClose] = mode.block ?? [null, null];
  let prev = 'start';              // last significant token: 'start' | 'value' | 'op' | a keyword
  let i = 0;
  while (i < n) {
    if (block) {
      const e = bClose ? line.indexOf(bClose, i) : -1;
      if (e < 0) { fill(i, n, C.comment); i = n; break; }
      fill(i, e + bClose.length, C.comment); i = e + bClose.length; block = false; continue;
    }
    const top = stack[stack.length - 1];
    if (top?.t === 'T') {                                   // inside a template string
      const a = i;
      while (i < n) {
        if (line[i] === '\\') { i += 2; continue; }
        if (line[i] === '`') { i++; stack.pop(); break; }
        if (line[i] === '$' && line[i + 1] === '{') { i += 2; stack.push({ t: 'E', d: 0 }); break; }
        i++;
      }
      fill(a, i, C.string);
      prev = 'value';
      continue;
    }
    const ch = line[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (mode.comment && line.startsWith(mode.comment, i)) { fill(i, n, C.comment); break; }
    if (bOpen && line.startsWith(bOpen, i)) {
      const e = line.indexOf(bClose, i + bOpen.length);
      if (e < 0) { fill(i, n, C.comment); block = true; i = n; break; }
      fill(i, e + bClose.length, C.comment); i = e + bClose.length; continue;
    }
    if (ch === '`' && mode.quotes.includes('`')) { cls[i] = C.string; i++; stack.push({ t: 'T' }); continue; }
    if (mode.quotes.includes(ch)) {
      const a = i; i++;
      while (i < n && line[i] !== ch) i += line[i] === '\\' ? 2 : 1;
      i = Math.min(n, i + 1);
      fill(a, i, C.string); prev = 'value'; continue;
    }
    const num = /^(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?/.exec(line.slice(i));
    if (num && (/\d/.test(ch) || (ch === '.' && /\d/.test(line[i + 1] ?? '')))) {
      fill(i, i + num[0].length, C.number); i += num[0].length; prev = 'value'; continue;
    }
    if (isIdStart(ch)) {
      const a = i;
      while (i < n && isId(line[i])) i++;
      const w = line.slice(a, i);
      const afterDot = line[a - 1] === '.';
      const c = afterDot ? C.text : mode.keywords.has(w) ? C.keyword : mode.constants.has(w) ? C.constant : mode.api.has(w) ? C.api : C.text;
      fill(a, i, c);
      prev = c === C.keyword && REGEX_AFTER_WORD.has(w) ? 'op' : 'value';
      continue;
    }
    if (ch === '/' && mode.regex !== false && (prev === 'start' || prev === 'op')) {
      // a regular expression literal: /.../flags
      let k = i + 1, inClass = false, ok = false;
      while (k < n) {
        const c = line[k];
        if (c === '\\') { k += 2; continue; }
        if (c === '[') inClass = true; else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) { ok = true; k++; break; }
        k++;
      }
      if (ok) {
        while (k < n && /[a-z]/.test(line[k])) k++;
        fill(i, k, C.regex); i = k; prev = 'value'; continue;
      }
    }
    // punctuation
    if (ch === '{' && top?.t === 'E') top.d++;
    if (ch === '}' && top?.t === 'E') {
      if (top.d === 0) { stack.pop(); cls[i] = C.string; i++; continue; }
      top.d--;
    }
    cls[i] = C.punct;
    prev = /[)\]}]/.test(ch) ? 'value' : 'op';
    i++;
  }
  const out = block ? 'B' : stack.map((s) => (s.t === 'T' ? 'T' : 'E' + s.d)).join(',');
  return { cls, state: out };
}

// BBC BASIC keywords, from the tokeniser's tables (the listing is plain text: Edit detokenises BASIC files)
const BASIC_WORDS = new Set([...TOKEN_NAMES, ...STMT_NAMES, ...FN_NAMES].filter((w) => w && !/\s/.test(w)).map((w) => w.replace(/\($/, '')));

/** BBC BASIC V listings: line numbers, keywords (upper case), REM, strings, numbers (&hex, %binary), PROC/FN names. */
function lexBasic(mode, line) {
  const n = line.length, cls = new Uint8Array(n);
  const fill = (a, b, c) => { for (let k = a; k < b && k < n; k++) cls[k] = c; };
  let i = 0;
  const ln = /^\s*\d+/.exec(line);
  if (ln) { fill(0, ln[0].length, C.lineno); i = ln[0].length; }
  const star = /^\s*\*/.exec(line.slice(i));                // a * command: the rest of the line
  if (star) { fill(i + star[0].length - 1, n, C.command); return { cls, state: '' }; }
  while (i < n) {
    const ch = line[i];
    if (ch === '"') {
      const a = i; i++;
      while (i < n && !(line[i] === '"' && line[i + 1] !== '"')) i += line[i] === '"' ? 2 : 1;
      i = Math.min(n, i + 1);
      fill(a, i, C.string); continue;
    }
    if (ch === '&' && /[\da-fA-F]/.test(line[i + 1] ?? '')) { const a = i; i++; while (i < n && /[\da-fA-F]/.test(line[i])) i++; fill(a, i, C.number); continue; }
    if (ch === '%' && /[01]/.test(line[i + 1] ?? '') && !/[\w]/.test(line[i - 1] ?? '')) { const a = i; i++; while (i < n && /[01]/.test(line[i])) i++; fill(a, i, C.number); continue; }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(line[i + 1] ?? ''))) {
      const m = /^\d*\.?\d*(?:E[+-]?\d+)?/i.exec(line.slice(i));
      fill(i, i + m[0].length, C.number); i += m[0].length; continue;
    }
    if (/[A-Za-z_`]/.test(ch)) {
      const a = i;
      // keywords are upper case and may run straight into a name (PRINTa): take the longest keyword first
      if (/[A-Z]/.test(ch)) {
        let kw = '';
        for (let k = Math.min(n, i + 9); k > i; k--) { const w = line.slice(i, k); if (BASIC_WORDS.has(w) || mode.keywords.has(w)) { kw = w; break; } }
        if (kw === 'REM') { fill(i, n, C.comment); break; }
        if (kw === 'PROC' || kw === 'FN') {
          i += kw.length; const b = i;
          while (i < n && /[\w`]/.test(line[i])) i++;
          fill(a, b, C.keyword); fill(b, i, C.api); continue;
        }
        if (kw && (kw.length > 1 || !/[\w]/.test(line[i + 1] ?? ''))) { i += kw.length; fill(a, i, C.keyword); if (line[i] === '$' && BASIC_WORDS.has(kw + '$')) { cls[i] = C.keyword; i++; } continue; }
      }
      while (i < n && /[\w`]/.test(line[i])) i++;
      if (/[$%]/.test(line[i] ?? '')) i++;
      fill(a, i, C.variable); continue;
    }
    if (ch !== ' ') cls[i] = C.punct;
    i++;
  }
  return { cls, state: '' };
}

/** Obey files: | comments, the command word, <Variable$Name>s, %0-%9 parameters, strings. */
function lexObey(mode, line) {
  const n = line.length, cls = new Uint8Array(n);
  const fill = (a, b, c) => { for (let k = a; k < b && k < n; k++) cls[k] = c; };
  const m = /^(\s*\**)([^\s|]*)/.exec(line);
  if (/^\s*\|/.test(line)) { fill(0, n, C.comment); return { cls, state: '' }; }
  fill(m[1].length, m[0].length, C.command);
  for (let i = m[0].length; i < n; i++) {
    const ch = line[i];
    if (ch === '|' && line[i - 1] !== '\\' && /\s/.test(line[i - 1] ?? ' ')) { fill(i, n, C.comment); break; }
    if (ch === '<') { const e = line.indexOf('>', i); if (e > i) { fill(i, e + 1, C.api); i = e; continue; } }
    if (ch === '%' && /[\d*]/.test(line[i + 1] ?? '')) { fill(i, i + 2 + (line[i + 1] === '*' ? 1 : 0), C.constant); i++; continue; }
    if (ch === '"') { const e = line.indexOf('"', i + 1); const b = e < 0 ? n : e + 1; fill(i, b, C.string); i = b - 1; continue; }
    if (ch === '-' && /[A-Za-z]/.test(line[i + 1] ?? '') && /\s/.test(line[i - 1] ?? ' ')) { let k = i + 1; while (k < n && /\w/.test(line[k])) k++; fill(i, k, C.keyword); i = k - 1; }
  }
  return { cls, state: '' };
}

const LEXERS = {
  'c-like': lexCLike,
  basic: lexBasic,
  obey: lexObey,
  text: (mode, line) => ({ cls: new Uint8Array(line.length), state: '' }),
};
export const LEXER_NAMES = Object.keys(LEXERS);

// ---------------------------------------------------------------------------------- the modes
const BUILTIN = ['JavaScript', 'JSON', 'BASIC', 'Obey', 'Text'];
let modes = null;

/** Load the modes: from <JsEdit$Dir>.Modes (every file there), else the copies the application was made from. */
export async function loadModes(os) {
  if (modes) return modes;
  const vfs = os.vfs;
  const dir = `${os.sysvars.get('JsEdit$Dir') ?? 'ADFS::HardDisc4.$.Apps.!JsEdit'}.Modes`;
  const list = [];
  try {
    if (vfs.isDir(dir)) for (const f of vfs.list(dir)) if (f.type === 'file') list.push(parseMode(await vfs.readText(f.path)));
  } catch (e) { console.warn('JsEdit modes', e); }
  if (!list.length) {
    for (const n of BUILTIN) {
      try { const r = await fetch(`src/apps/JsEdit/Modes/${n}`); if (r.ok) list.push(parseMode(await r.text())); } catch { /* */ }
    }
  }
  if (!list.some((m) => m.name === 'Text')) list.push(parseMode('Name Text\nLexer text\n'));
  modes = list;
  return modes;
}
export function reloadModes() { modes = null; }
export const allModes = () => modes ?? [];
export const modeNamed = (name) => (modes ?? []).find((m) => m.name.toLowerCase() === String(name).toLowerCase()) ?? null;
/** The mode for a file type (Text if none claims it). */
export function modeForType(type) {
  return (modes ?? []).find((m) => m.types.includes(type)) ?? modeNamed('Text');
}
