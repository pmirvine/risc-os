// Edit's Find/Replace patterns (RISC_OSLib txtfind / txtregexp), compiled to JS RegExps.
//
// Two pattern languages, as in the 3.71 Find box:
//  * "Wildcarded expressions" (new style):  .  any char   $ newline   @ alphanumeric or _   # digit
//      |X ctrl-X   \x literal x   [set] (with a-z ranges)   ~x not x   *x zero or more x
//      ^x one or more x   %x longest sequence of x   (char &84)XX hex char
//    Replacement: & = found string, ?n = n'th ambiguous sub-pattern (0-based), $ |X \x hex as above.
//  * "Magic characters" (old style, '\' escapes): \. any  \a letter/digit  \d digit  \xXX hex
//      \n newline  \cX ctrl-X  \\ backslash  \* any string;  replacement: \& found string, \n \cX \xXX.
// Without either option the find string is literal. Case-insensitive unless "Case sensitive".

const HEX_CH = '\x84';
const esc = (c) => c.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');
const cc = (code) => '\\x' + code.toString(16).padStart(2, '0');

export class PatternError extends Error {}

function ctrlChar(ch) {
  const u = ch.toUpperCase();
  const c = u.charCodeAt(0);
  if (c < 64 || c > 95) {
    if (ch === '?') return 127;
    throw new PatternError('Find string contains unrecognised characters');
  }
  return c - 64;
}

/** Parse one wildcard element at s[i]; returns {re, next, ambiguous}. */
function wildElement(s, i) {
  const c = s[i];
  if (c === undefined) throw new PatternError('Find string contains unrecognised characters');
  switch (c) {
    case '.': return { re: '[^\\n]', next: i + 1, amb: true };
    case '$': return { re: '\\n', next: i + 1 };
    case '@': return { re: '[A-Za-z0-9_]', next: i + 1, amb: true };
    case '#': return { re: '[0-9]', next: i + 1, amb: true };
    case '|': if (i + 1 >= s.length) throw new PatternError('Find string contains unrecognised characters');
      return { re: cc(ctrlChar(s[i + 1])), next: i + 2 };
    case '\\': if (i + 1 >= s.length) throw new PatternError('Find string contains unrecognised characters');
      return { re: esc(s[i + 1]), next: i + 2 };
    case HEX_CH: {
      const h = s.slice(i + 1, i + 3);
      if (!/^[0-9a-f]{2}$/i.test(h)) throw new PatternError('Find string contains unrecognised characters');
      return { re: cc(parseInt(h, 16)), next: i + 3 };
    }
    case '[': {
      let j = i + 1, body = '';
      while (j < s.length && s[j] !== ']') {
        let ch = s[j];
        if (ch === '\\' && j + 1 < s.length) { body += esc(s[j + 1]); j += 2; continue; }
        if (ch === '|' && j + 1 < s.length) { body += cc(ctrlChar(s[j + 1])); j += 2; continue; }
        if (ch === '-' && body) { body += '-'; j++; continue; }
        body += esc(ch); j++;
      }
      if (s[j] !== ']') throw new PatternError('Find string contains unrecognised characters');
      return { re: `[${body}]`, next: j + 1, amb: true, set: body };
    }
    case '~': {
      const e = wildElement(s, i + 1);
      const inner = e.set != null ? e.set : e.re.startsWith('[') ? e.re.slice(1, -1) : e.re;
      return { re: `[^${inner}]`, next: e.next, amb: true };
    }
    case '*': case '^': case '%': {
      const e = wildElement(s, i + 1);
      const q = c === '*' ? '*?' : c === '^' ? '+?' : '+';
      return { re: `(?:${e.re})${q}`, next: e.next, amb: true };
    }
    default: return { re: esc(c), next: i + 1 };
  }
}

/**
 * Compile a find string. mode: 'plain' | 'magic' (old \ patterns) | 'wild' (wildcarded expressions).
 * Returns {re: RegExp (global, sticky-free), groups: number}.
 */
export function compileFind(str, { mode = 'plain', caseSensitive = false } = {}) {
  let src = '';
  let groups = 0;
  if (mode === 'plain') src = esc(str);
  else if (mode === 'magic') {
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c !== '\\') { src += esc(c); continue; }
      const d = str[++i];
      switch (d) {
        case '.': src += '[^\\n]'; break;
        case 'a': src += '[A-Za-z0-9]'; break;
        case 'd': src += '[0-9]'; break;
        case 'n': src += '\\n'; break;
        case '*': src += '[^\\n]*?'; break;
        case 'c': { const x = str[++i]; if (x == null) throw new PatternError('Find string contains unrecognised characters'); src += cc(ctrlChar(x)); break; }
        case 'x': case 'X': {
          const h = str.slice(i + 1, i + 3); i += 2;
          if (!/^[0-9a-f]{2}$/i.test(h)) throw new PatternError('Find string contains unrecognised characters');
          src += cc(parseInt(h, 16)); break;
        }
        case undefined: throw new PatternError('Find string contains unrecognised characters');
        default: src += esc(d);
      }
    }
  } else {
    let i = 0;
    while (i < str.length) {
      const e = wildElement(str, i);
      if (e.amb) { src += `(${e.re})`; groups++; } else src += e.re;
      i = e.next;
    }
  }
  return { re: new RegExp(src, caseSensitive ? 'g' : 'gi'), groups, mode };
}

/** Find the next match at or after 'from'. Returns {start, end, match} or null. */
export function findNext(text, pat, from) {
  pat.re.lastIndex = from;
  for (;;) {
    const m = pat.re.exec(text);
    if (!m) return null;
    if (m[0].length === 0) {           // never report empty matches (e.g. "*x" alone)
      if (m.index >= text.length) return null;
      pat.re.lastIndex = m.index + 1;
      continue;
    }
    return { start: m.index, end: m.index + m[0].length, match: m };
  }
}

/** Count matches from 'from' to the end of the text. */
export function countMatches(text, pat, from) {
  let n = 0, at = from;
  for (;;) {
    const r = findNext(text, pat, at);
    if (!r) return n;
    n++;
    at = r.end > at ? r.end : at + 1;
  }
}

/** Build the replacement string for a match. */
export function expandReplace(repl, m, mode) {
  if (mode === 'plain') return repl;
  let out = '';
  for (let i = 0; i < repl.length; i++) {
    const c = repl[i];
    if (mode === 'magic') {
      if (c !== '\\') { out += c; continue; }
      const d = repl[++i];
      if (d === '&') out += m[0];
      else if (d === 'n') out += '\n';
      else if (d === 'c') out += String.fromCharCode(ctrlChar(repl[++i] ?? '@'));
      else if (d === 'x' || d === 'X') { out += String.fromCharCode(parseInt(repl.slice(i + 1, i + 3), 16) || 0); i += 2; }
      else if (d != null) out += d;
      continue;
    }
    switch (c) {
      case '&': out += m[0]; break;
      case '$': out += '\n'; break;
      case '|': out += String.fromCharCode(ctrlChar(repl[++i] ?? '@')); break;
      case '\\': if (i + 1 < repl.length) out += repl[++i]; break;
      case HEX_CH: out += String.fromCharCode(parseInt(repl.slice(i + 1, i + 3), 16) || 0); i += 2; break;
      case '?': {
        const d = repl[i + 1];
        if (d >= '0' && d <= '9') { out += m[+d + 1] ?? ''; i++; } else out += c;
        break;
      }
      default: out += c;
    }
  }
  return out;
}
