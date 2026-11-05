// rtf-helpers (Batch G2, tasks 7-9): what an RTF round trip must keep,
// for comparing a Doc with the Doc readRtf(writeRtf(doc).bytes) gives.
//
//   modelCore(doc) -> {info, sections, styles}
//     info      the core properties RTF's \info holds (FieldDates
//               coreOf: title, subject, creator, keywords,
//               lastModifiedBy; created / modified as ISO strings)
//     sections  [{page, type, blocks}]: page the pgSz / pgMar values,
//               blocks [{text, style, inlines, runs, para}] for a
//               paragraph (text with U+FFFC for each inline; style
//               the paragraph style's NAME; inlines [[index, kind]]
//               (a raw one by its node name); runs [[text, core]]
//               with adjacent equal ones merged; para the resolved
//               paragraph properties; list [text, level, format]
//               of its number (./ListNumbers labels), when it has
//               one), a table as tableCore, {type} for anything
//               else
//     styles    {name: {type, basedOn, next, run, para}} for the
//               paragraph and character styles (names, not ids)
//   Run and paragraph properties are RESOLVED (docDefaults, the
//   style chains, direct formatting: ./Styles) and normalised
//   (defaults left out, Word's size 20 when none), so the same look
//   compares equal however it is split between styles and runs.
//   assertSameCore(got, want, what)  deep equal, except that only
//     the styles `want` has are compared (the reader adds newDoc's)
//   tableCore {type: 'tbl', grid, jc, ind, gap, borders, rows: [{
//     height, header, cantSplit, before, cells: [{span, vMerge,
//     vAlign, borders, shd, blocks}]}]}: what a table shows (the
//     table's indent of its text, its cell gap (left margin, Word's
//     108 when none), borders by side; widths only as the grid)
//   notesCore(doc) -> {footnotes, endnotes}: the normal notes'
//     blocks in their order
//   storiesCore(doc) -> [{hdr: {type: blocks}, ftr}] per section:
//     the headers and footers its own references reach
//   reviewCore(doc) -> {comments, revs}: the body's comments (in
//     the order of their marks; authors, initials, dates, replies,
//     text, the text their ranges cover) and tracked changes (text,
//     kind, author, date; paragraph marks too): see its comment
//
// Written independently of RtfWrite: it reads the Model the way
// Word shows it, not the way the writer emits it.
import assert from 'node:assert/strict';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {resolveRun, paraLayers, resolvePara} from
  '../../tools/moreapps/!Letters/Styles';
import {fontName} from '../../tools/moreapps/!Letters/Fmt';
import {colorOf} from '../../tools/moreapps/!Letters/ThemeRead';
import {coreOf} from '../../tools/moreapps/!Letters/FieldDates';
import {labels} from '../../tools/moreapps/!Letters/ListNumbers';
import {refsOf, storyOfRef} from
  '../../tools/moreapps/!Letters/SectRefs';
import {docMap} from '../../tools/moreapps/!Letters/PicRead';

const HEX6 = (v) => typeof v === 'string' && v.length === 6 &&
  [...v].every((c) => '0123456789abcdefABCDEF'.includes(c));
const hex = (v) => (HEX6(v) ? v.toUpperCase() : undefined);
const OFF = ['0', 'false', 'off'];

/** The last w:<name> node in extra: on (true), off (false), none. */
function flagOf(extra, name) {
  let v;
  for (const n of extra || []) {
    if (!n || n.name !== 'w:' + name) continue;
    const a = (n.attrs || []).find((x) => x[0] === 'w:val');
    v = !a || !OFF.includes(String(a[1]));
  }
  return v;
}

function valOf(extra, name) {
  let v;
  for (const n of extra || []) {
    if (!n || n.name !== 'w:' + name) continue;
    const a = (n.attrs || []).find((x) => x[0] === 'w:val');
    v = a ? Number(a[1]) : undefined;
  }
  return v;
}

/** A resolved rPr, normalised. */
export function runCore(r, theme) {
  const o = {};
  for (const k of ['b', 'i', 'strike']) if (r[k] === true) o[k] = true;
  if (typeof r.u === 'string' && r.u !== 'none') o.u = r.u;
  o.sz = Number.isInteger(r.sz) ? r.sz : 20;
  o.font = fontName(r, theme);
  // (a theme colour kept raw: the w:val Word shows)
  let color = hex(r.color);
  if (r.color === undefined) {
    for (const n of r.extra || []) {
      const a = n && n.name === 'w:color' &&
        (n.attrs || []).find((x) => x[0] === 'w:val');
      if (!a) continue;
      color = hex(a[1]);
      // (a theme colour follows the document's theme, unless the
      // w:val is the same colour but for Word's rounding)
      const at = Object.fromEntries((n.attrs || []).map(([k, v]) =>
        [k.split(':').pop(), v]));
      const res = theme && typeof at.themeColor === 'string'
        ? hex(colorOf(theme, {...at, color: at.val})) : undefined;
      if (res && !(color && [0, 2, 4].every((i) => Math.abs(
        parseInt(color.slice(i, i + 2), 16) -
        parseInt(res.slice(i, i + 2), 16)) <= 2))) color = res;
    }
  }
  if (color) o.color = color;
  if (typeof r.highlight === 'string' && r.highlight !== 'none')
    o.highlight = r.highlight;
  const s = r.shd;
  const fill = s && (s.val === 'solid' && hex(s.color) ? hex(s.color)
    : hex(s.fill));
  if (fill) o.shade = fill;
  if (r.vertAlign === 'superscript' || r.vertAlign === 'subscript')
    o.vertAlign = r.vertAlign;
  for (const k of ['caps', 'smallCaps', 'vanish', 'dstrike']) {
    if (flagOf(r.extra, k)) o[k] = true;
  }
  const pos = valOf(r.extra, 'position');
  if (pos) o.position = pos;
  return o;
}

/** The tab stops in force: each layer's stops set or clear. */
function tabsOf(styles, para) {
  const at = new Map();
  for (const l of paraLayers(styles, para)) {
    for (const t of (l && l.tabs) || []) {
      if (t.val === 'clear') at.delete(t.pos);
      else at.set(t.pos, t);
    }
  }
  return [...at.values()].sort((a, b) => a.pos - b.pos).map((t) => {
    const o = {val: t.val === 'start' ? 'left' : t.val === 'end'
      ? 'right' : t.val, pos: t.pos};
    if (t.leader && t.leader !== 'none') o.leader = t.leader;
    return o;
  });
}

const JC = {start: 'left', end: 'right', distribute: 'both'};

/** A resolved pPr, normalised. */
export function paraCore(styles, para) {
  const p = resolvePara(styles, para);
  const o = {};
  const jc = JC[p.jc] || p.jc;
  if (jc && jc !== 'left') o.jc = jc;
  const ind = p.ind || {};
  for (const k of ['left', 'right']) if (ind[k]) o[k] = ind[k];
  const first = ind.hanging ? -ind.hanging : ind.firstLine || 0;
  if (first) o.first = first;
  const sp = p.spacing || {};
  if (sp.before) o.before = sp.before;
  if (sp.after) o.after = sp.after;
  const rule = sp.lineRule || 'auto';
  if (sp.line !== undefined && !(sp.line === 240 && rule === 'auto'))
    o.line = [sp.line, rule];
  for (const k of ['keepNext', 'keepLines', 'pageBreakBefore',
    'contextualSpacing', 'suppressLineNumbers']) {
    if (p[k] === true) o[k] = true;
  }
  if (p.widowControl === false) o.widowControl = false;
  if (Number.isInteger(p.outlineLvl) && p.outlineLvl < 9)
    o.outlineLvl = p.outlineLvl;
  const tabs = tabsOf(styles, para);
  if (tabs.length) o.tabs = tabs;
  const bdr = {};
  for (const [side, b] of Object.entries(p.pBdr || {})) {
    if (!b || !b.val || b.val === 'nil' || b.val === 'none') continue;
    const x = {val: b.val};
    if (b.sz !== undefined) x.sz = b.sz;
    if (b.space) x.space = b.space;
    if (hex(b.color)) x.color = hex(b.color);
    if (b.shadow) x.shadow = true;
    bdr[side] = x;
  }
  if (Object.keys(bdr).length) o.borders = bdr;
  const s = p.shd;
  if (s && !(s.val === 'clear' && !hex(s.fill))) {
    o.shd = {val: s.val, color: hex(s.color) || 'auto',
      fill: hex(s.fill) || 'auto'};
  }
  return o;
}

const styleName = (styles, id, type) => {
  const s = id === undefined || id === null ? undefined
    : styles.styles.get(id);
  if (s && s.type === type) return s.name;
  const d = styles.defaults[type];
  const ds = d ? styles.styles.get(d) : undefined;
  return ds ? ds.name : null;
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function paraOf(styles, p, labs) {
  const theme = styles.theme;
  const runs = [];
  for (const r of p.runs) {
    const core = runCore(resolveRun(styles, p, r), theme);
    if (r.rev) core.rev = r.rev.kind;
    const text = p.text.slice(r.start, r.end);
    const last = runs[runs.length - 1];
    if (last && same(last[1], core)) last[0] += text;
    else runs.push([text, core]);
  }
  const inlines = Object.keys(p.inlines).map(Number)
    .sort((a, b) => a - b).map((i) => {
      const x = p.inlines[String(i)];
      return [i, x.kind === 'raw' && x.node ? x.node.name : x.kind +
        (x.brType ? ':' + x.brType : '')];
    });
  const o = {text: p.text, style: styleName(styles, p.pStyle,
    'paragraph'), inlines, runs, para: paraCore(styles, p)};
  const l = labs && labs.get(p.id);
  if (l) o.list = [l.text, l.level, l.fmt];
  return o;
}

function sideCore(b) {
  const out = {};
  for (const [k, v] of Object.entries(b || {})) {
    if (!v || !v.val || v.val === 'none') continue;
    const side = k === 'start' ? 'left' : k === 'end' ? 'right' : k;
    const x = {val: v.val};
    if (v.val !== 'nil') {
      if (v.sz !== undefined) x.sz = v.sz;
      if (v.space) x.space = v.space;
      if (hex(v.color)) x.color = hex(v.color);
    }
    out[side] = x;
  }
  return Object.keys(out).length ? out : null;
}

function shdCore(s) {
  if (!s || (s.val === 'clear' && !hex(s.fill))) return null;
  return {val: s.val, color: hex(s.color) || 'auto',
    fill: hex(s.fill) || 'auto'};
}

const w = (m) => (m && (m.type === 'dxa' || m.type === undefined) &&
  Number.isInteger(m.w) ? m.w : undefined);

export function tableCore(styles, t, labs) {
  const pr = t.tblPr || {};
  const mar = pr.tblCellMar || {};
  return {type: 'tbl', grid: t.grid,
    jc: pr.jc === 'center' || pr.jc === 'right' ? pr.jc : null,
    ind: w(pr.tblInd) || 0, gap: w(mar.left) ?? 108,
    borders: sideCore(pr.tblBorders),
    rows: t.rows.map((r) => {
      const tr = r.trPr || {};
      const h = tr.trHeight;
      return {height: h && h.hRule !== 'auto' && h.val
        ? [h.val, h.hRule || 'atLeast'] : null,
      header: tr.tblHeader === true, cantSplit: tr.cantSplit === true,
      before: tr.gridBefore || 0,
      cells: r.cells.map((c) => {
        const tc = c.tcPr || {};
        return {span: tc.gridSpan || 1, vMerge: tc.vMerge || null,
          vAlign: tc.vAlign || null, borders: sideCore(tc.tcBorders),
          shd: shdCore(tc.shd), blocks: blocksCore(styles, c.blocks,
            labs)};
      })};
    })};
}

function blocksCore(styles, blocks, labs) {
  return blocks.map((b) => (b.type === 'p' ? paraOf(styles, b, labs)
    : b.type === 'tbl' ? tableCore(styles, b, labs) : {type: b.type}));
}

export function notesCore(doc) {
  const out = {};
  for (const slot of ['footnotes', 'endnotes']) {
    const m = doc.notes && doc.notes[slot];
    const order = (doc.notes && doc.notes.order &&
      doc.notes.order[slot]) || [];
    out[slot] = order.map((id) => m.get(id)).filter((n) => n &&
      n.type === 'normal').map((n) => blocksCore(doc.styles,
      n.blocks));
  }
  return out;
}

export function storiesCore(doc) {
  const map = docMap(doc);
  return doc.sections.map((s) => {
    const refs = refsOf(s, map);
    const o = {};
    for (const kind of ['hdr', 'ftr']) {
      o[kind] = {};
      for (const type of ['default', 'first', 'even']) {
        const id = refs[kind][type];
        const st = id && doc.stories.get(storyOfRef(doc, id));
        if (st) o[kind][type] = blocksCore(doc.styles, st.blocks);
      }
    }
    return o;
  });
}

const iso = (d) => (d ? d.toISOString() : null);

export function modelCore(doc) {
  const styles = doc.styles;
  const c = coreOf(doc);
  const info = {title: c.title, subject: c.subject, creator: c.creator,
    keywords: c.keywords, created: iso(c.created),
    modified: iso(c.modified)};
  const labs = labels(doc);
  const sections = doc.sections.map((s) => ({
    page: {...(s.props.pgSz || {}), ...(s.props.pgMar || {})},
    type: s.props.type || null,
    blocks: blocksCore(styles, s.blocks, labs),
  }));
  const out = {};
  for (const s of styles.styles.values()) {
    if (s.type !== 'paragraph' && s.type !== 'character') continue;
    const name = (id) => (id === undefined ? null
      : (styles.styles.get(id) || {}).name || null);
    const probe = {type: 'p', text: 'x', runs: [], inlines: {},
      pPr: {extra: []}};
    const run = {start: 0, end: 1, rPr: {extra: []}};
    if (s.type === 'paragraph') probe.pStyle = s.id;
    else run.rStyle = s.id;
    out[s.name] = {type: s.type, basedOn: name(s.basedOn),
      next: name(s.next),
      run: runCore(resolveRun(styles, probe, run), styles.theme),
      para: s.type === 'paragraph' ? paraCore(styles, probe) : null};
  }
  return {info, sections, styles: out};
}

const xattr = (n, k) => {
  const a = n && Array.isArray(n.attrs) &&
    n.attrs.find((x) => x[0] === k);
  return a ? String(a[1]) : null;
};

/** The paragraph mark's revision in pPr.extra: [kind, author, date]
 *  or null. */
function markRevOf(p) {
  for (const n of (p.pPr && p.pPr.extra) || []) {
    if (!n || n.name !== 'w:rPr') continue;
    for (const c of n.children || []) {
      if (c && (c.name === 'w:ins' || c.name === 'w:del')) {
        return [c.name.slice(2), xattr(c, 'w:author'),
          xattr(c, 'w:date')];
      }
    }
  }
  return null;
}

/** The body's paragraphs, tables' too, in reading order. */
function bodyParas(doc) {
  const out = [];
  const walk = (blocks) => {
    for (const b of blocks) {
      if (b.type === 'p') out.push(b);
      else if (b.type === 'tbl') {
        for (const r of b.rows) for (const c of r.cells) walk(c.blocks);
      }
    }
  };
  for (const s of doc.sections) walk(s.blocks);
  return out;
}

const plainOf = (blocks) => blocks.filter((b) => b.type === 'p')
  .map((b) => b.text.split(OBJ).join('')).join('\n');

/** reviewCore(doc) -> {comments, revs}
 *    comments [{author, initials, date, parent, text, range}] in the
 *      order of their marks (cmtRef) in the body: parent the index
 *      of the parent's entry (or null), text the comment's text
 *      without marks, range the body text its range covers ('\n'
 *      between paragraphs, null when it has none). Ids are not
 *      compared (a writer may number them afresh); done is not
 *      (RTF has no such state)
 *    revs [[text, kind, author, date]]: the body's tagged runs with
 *      adjacent equal ones merged ('\u00b6' for a paragraph mark's
 *      revision), author and date null when none
 */
export function reviewCore(doc) {
  const map = (doc.comments && doc.comments.map) || new Map();
  const order = [], ranges = new Map(), open = new Map();
  const revs = [];
  let prev = null;
  const rev = (text, k) => {
    const key = JSON.stringify(k);
    if (prev === key) revs[revs.length - 1][0] += text;
    else if (k) revs.push([text, ...k]);
    prev = k ? key : null;
  };
  for (const p of bodyParas(doc)) {
    for (const s of open.keys()) open.set(s, open.get(s) + '\n');
    const at = new Map(p.runs.map((r) => [r.start, r]));
    let run = null;
    for (let i = 0; i < p.text.length; i++) {
      run = at.get(i) || run;
      const c = p.text[i];
      const x = c === OBJ ? p.inlines[String(i)] : null;
      if (x && x.kind === 'cmtStart') open.set(x.id, '');
      else if (x && x.kind === 'cmtEnd' && open.has(x.id)) {
        ranges.set(x.id, open.get(x.id));
        open.delete(x.id);
      } else if (x && x.kind === 'cmtRef' && map.has(x.id)) {
        order.push(x.id);
      }
      if (c !== OBJ) {
        for (const s of open.keys()) open.set(s, open.get(s) + c);
      }
      const r = run && run.rev;
      rev(c === OBJ ? '' : c, r ? [r.kind, r.author ?? null,
        r.date ?? null] : null);
    }
    const m = markRevOf(p);
    rev('\u00b6', m);
  }
  const comments = order.map((id) => {
    const c = map.get(id);
    const pi = c.parent === null || c.parent === undefined ? -1
      : order.indexOf(c.parent);
    return {author: c.author, initials: c.initials, date: c.date,
      parent: pi < 0 ? null : pi, text: plainOf(c.blocks),
      range: ranges.has(id) ? ranges.get(id) : null};
  });
  return {comments, revs};
}

export function assertSameCore(got, want, what = '') {
  const pick = {};
  for (const k of Object.keys(want.styles)) pick[k] = got.styles[k];
  assert.deepEqual({...got, styles: pick}, want, what);
}
