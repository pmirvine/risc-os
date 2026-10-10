// The !Word stub's line breaking (tools/moreapps/!Word/Render before
// LineLayout), kept only so linelayout.test.mjs can check that the
// new layout breaks lines exactly as it did. One change: alignment
// leaves out the spaces at the end of a line even when they were
// merged into the item before them (the stub counted them then).
// And one more since tab stops (A4.1, TabStops): a tab's half-inch
// stops are counted from the margin, as Word counts them, not from
// the left indent, and a tab with no stop before the right edge
// goes to the right edge.
// Render - lays out one paragraph for the screen: its text broken
// into lines that fit a width, run by run in each run's font.
//
//   layoutPara(para, styles, width, measure, cache)
//     -> {h, lines: [{y, h, base, items}]}
//   items: [{x, w, text, f, kind}]  kind 'text' | 'link' | 'box'
//   measure(text, css) -> width in pixels (see makeMeasure)
//
// Lines break greedily at spaces (a word longer than the line stays
// whole and runs over); tabs jump to the next half inch; a line
// break (w:br) starts a new line. U+FFFC items: a hyperlink shows its
// text in blue, underlined; other wrappers with text (an insertion, a
// simple field, a content control...) show it in the format there;
// the unseen kinds of ./Kinds (proofing marks, bookmarks, field codes)
// and deletions draw nothing; a non-breaking hyphen is '-', a soft
// hyphen nothing; anything else is a small grey [...] box.
// Alignment: left, centre or right (justified is shown left).
// Pure: no desktop services.
import {OBJ} from '../../tools/moreapps/!Word/Model';
import {runFmt, paraFmt} from '../../tools/moreapps/!Word/Fmt';
import {UNSEEN, localName} from '../../tools/moreapps/!Word/Kinds';

const TAB = 48;                        // half an inch at 96 dpi
const PLAIN = {rPr: {extra: []}};

/** A measuring function for a 2D context, with a width cache. */
export function makeMeasure(g) {
  const cache = new Map();
  return (text, css) => {
    let m = cache.get(css);
    if (!m) { m = new Map(); cache.set(css, m); }
    let w = m.get(text);
    if (w === undefined) {
      if (g.font !== css) g.font = css;
      w = g.measureText(text).width;
      m.set(text, w);
    }
    return w;
  };
}

const linkFmt = (f) => ({...f, colour: '#0000c0', under: true,
  css: f.css});
const boxFmt = (f) => {
  const px = Math.max(8, Math.round(f.px * 0.75));
  return {...f, px, colour: '#606060', under: false, strike: false,
    css: `${px}px "Liberation Sans", sans-serif`};
};

/** The text of a raw inline that is a w:t (a tab in a w:t...). */
function bareT(x) {
  const n = x.node;
  if (x.kind !== 'raw' || !n || typeof n.name !== 'string' ||
    n.name.split(':').pop() !== 't') return '';
  return (n.children || []).filter((c) => typeof c === 'string')
    .join('');
}

// drawn as nothing, besides ./Kinds: deletions (tracked changes)
const NOTHING = new Set(['del', 'moveFrom', 'softHyphen']);

/** Words, spaces, tabs and breaks of `text`, all in format f. */
function words(text, f, kind, out) {
  for (const m of text.matchAll(/ +|\t|\n|[^ \t\n]+/g)) {
    const s = m[0];
    if (s === '\t') out.push({t: 'tab', f});
    else if (s === '\n') out.push({t: 'nl', f});
    else out.push({t: s[0] === ' ' ? 's' : 'w', text: s, f, kind});
  }
}

/** The paragraph as a list of tokens. */
function tokens(para, styles, cache) {
  const out = [];
  const text = para.text;
  const runs = para.runs.length ? para.runs
    : [{start: 0, end: text.length, rPr: {extra: []}}];
  let at = 0;
  const piece = (from, to, run) => {
    const f = runFmt(styles, para, run, cache);
    let k = from;
    for (let i = from; i <= to; i++) {
      if (i < to && text[i] !== OBJ) continue;
      if (i > k) words(text.slice(k, i), f, 'text', out);
      if (i < to) {
        const x = para.inlines[i] || {};
        if (x.kind === 'br') out.push({t: 'nl', f});
        else if (x.kind === 'tab') out.push({t: 'tab', f});
        else if (bareT(x)) words(bareT(x), f, 'text', out);
        else drawInline(x, f, out);
      }
      k = i + 1;
    }
  };
  for (const run of runs) {
    if (run.start > at) piece(at, run.start, PLAIN);
    piece(run.start, run.end, run);
    at = Math.max(at, run.end);
  }
  if (at < text.length) piece(at, text.length, PLAIN);
  return out;
}

/** The tokens of a kept inline x (not a break or tab) in format f. */
function drawInline(x, f, out) {
  const l = localName(x.node);
  if (UNSEEN.has(l) || NOTHING.has(l)) return;
  if (l === 'noBreakHyphen') words('-', f, 'text', out);
  else if (x.text && l === 'hyperlink') {
    words(x.text, linkFmt(f), 'link', out);
  } else if (x.text) words(x.text, f, 'text', out);
  else out.push({t: 'w', text: '[...]', f: boxFmt(f), kind: 'box'});
}

/** See the header. */
export function layoutPara(para, styles, width, measure, cache) {
  const pf = paraFmt(styles, para);
  const base = runFmt(styles, para, para.runs[0] || PLAIN, cache);
  const left = pf.left, maxX = Math.max(left + 40, width - pf.right);
  const lines = [];
  let line = null, x = 0;
  let y = pf.before;
  const start = (first) => {
    line = {y: 0, h: 0, base: 0, items: [], px: 0};
    x = left + (first ? pf.first : 0);
  };
  const finish = () => {
    const px = line.px || base.px;
    line.h = px * 1.25 * pf.factor;
    line.base = line.h - px * 0.27;
    line.y = y;
    y += line.h;
    // alignment: the text up to the last thing that is not a space
    let end = left;
    for (const it of line.items) {
      if (it.text === undefined || /\S/.test(it.text)) {
        end = it.x + it.w - (it.kind === 'box' ? 0 : measure(
          it.text.slice(it.text.trimEnd().length), it.f.css));
      }
    }
    const room = maxX - end;
    const dx = pf.align === 'center' ? room / 2
      : pf.align === 'right' ? room : 0;
    if (dx > 0) for (const it of line.items) it.x += dx;
    delete line.px;
    lines.push(line);
  };
  const place = (tk, w) => {
    const items = line.items;
    const last = items[items.length - 1];
    line.px = Math.max(line.px, tk.f.px);
    if (last && last.f === tk.f && last.kind === tk.kind &&
      tk.kind !== 'box' && Math.abs(last.x + last.w - x) < 0.01) {
      last.text += tk.text;
      last.w += w;
    } else {
      items.push({x, w, text: tk.text, f: tk.f, kind: tk.kind});
    }
    x += w;
  };
  let group = [], groupW = 0;
  const flush = () => {
    if (!group.length) return;
    if (line.items.length && x + groupW > maxX) { finish(); start(); }
    for (const [tk, w] of group) place(tk, w);
    group = []; groupW = 0;
  };
  start(true);
  for (const tk of tokens(para, styles, cache)) {
    if (tk.t === 'w') {
      const w = measure(tk.text, tk.f.css) +
        (tk.kind === 'box' ? 6 : 0);
      group.push([tk, w]);
      groupW += w;
    } else if (tk.t === 's') {
      flush();
      if (line.items.length || !lines.length) {
        place(tk, measure(tk.text, tk.f.css));
      }
    } else if (tk.t === 'tab') {
      flush();
      if (x < maxX) x = Math.min(maxX, TAB * (Math.floor(x / TAB) + 1));
      line.px = Math.max(line.px, tk.f.px);
      line.items.push({x, w: 0, text: '', f: tk.f, kind: 'text'});
    } else {
      flush();
      line.px = Math.max(line.px, tk.f.px);
      finish();
      start();
    }
  }
  flush();
  finish();
  return {h: y + pf.after, lines};
}
