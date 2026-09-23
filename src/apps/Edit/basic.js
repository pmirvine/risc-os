// BASIC detokenise / retokenise for Edit (RISC_OSLib s.bastxt + txtfile BASIC support),
// using the BASIC interpreter's tokeniser (src/basic/tokens.js).
//
// detokeniseProgram(bytes, strip): text with LF line ends. With strip (Edit's default "Strip line
//   numbers") line numbers are removed - unless the program contains a line-number reference
//   (GOTO 100 …), in which case {needNumbers: true} is returned so the caller can ask the user
//   (message bas2) and retry with strip = false. Without strip, lines are "   10PRINT…" as LIST.
// tokeniseText(text, increment): tokenised program; lines without numbers get previous + increment.

import { parseProgram, detokenise, listLineNumber, tokenise, decodeLineNumber, finishLineBody, buildProgram, forEachLineRef, T } from '../../basic/tokens.js';

export function isBasicProgram(bytes) {
  if (!bytes.length) return true;
  return parseProgram(bytes) !== null;
}

function hasLineRef(body) {
  let found = false;
  forEachLineRef(body, () => { found = true; });
  return found;
}

export function detokeniseProgram(bytes, strip = true) {
  if (!bytes.length) return { text: '' };
  const p = parseProgram(bytes);
  if (!p) return { error: 'This file does not contain a BASIC program' };
  if (strip && p.lines.some((l) => hasLineRef(l.body))) return { needNumbers: true };
  let text = '';
  for (const l of p.lines) text += (strip ? '' : listLineNumber(l.num)) + detokenise(l.body) + '\n';
  return { text };
}

/**
 * Tokenise Edit text back into a BASIC program. Returns {bytes, warnings: [msg]} or throws
 * {message} (e.g. line number limit reached).
 */
export function tokeniseText(text, increment = 10) {
  const src = text.endsWith('\n') ? text.slice(0, -1) : text;
  const rawLines = src.length ? src.split('\n') : [];
  const lines = [];
  const warnings = [];
  let last = 0;
  let everNumbered = false, mixWarned = false;
  for (const raw of rawLines) {
    const r = tokenise(raw.replace(/\r$/, ''));
    let b = r.bytes;
    let i = 0;
    while (b[i] === 0x20) i++;
    let num;
    if (b[i] === T.CONST) {
      num = decodeLineNumber(b[i + 1], b[i + 2], b[i + 3]);
      b = b.slice(i + 4);
      everNumbered = true;
    } else {
      num = last + increment;
      if (everNumbered && !mixWarned) { warnings.push(`Mixture of lines with and without line numbers detected at line ${num}`); mixWarned = true; }
    }
    if (num > 65279) throw new Error('Line number limit reached.  Reduce line number increment, and re-save');
    if (r.lineTooBig) warnings.push(`Number too large at line ${num}`);
    if (r.unmatchedQuote) warnings.push(`Mismatched quotes at line ${num}`);
    if (r.unmatchedBrackets) warnings.push(`Mismatched brackets at line ${num}`);
    b = finishLineBody(b);
    if (b.length > 251) b = b.slice(0, 251);
    lines.push({ num, body: Uint8Array.from(b) });
    last = num;
  }
  return { bytes: buildProgram(lines), warnings };
}
