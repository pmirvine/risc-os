// FormatSet property test: random formatting commands, undo and redo
// on random documents against a reference model that holds, for
// every character, its character style and its direct formatting
// (written as the commands' rules say: a value equal to the style's
// is not kept), and for every paragraph its style and alignment.
// After every step the formatting the screen draws (./Fmt.runFmt),
// the resolved properties and Format.query all agree with the
// reference; the model invariants hold; undoing everything gives
// back the original. Documents come in two kinds: the built-in styles
// of a new document, and styles with no size anywhere (a heading is
// then bold only by the heading rule). The reference has its own
// copy of that rule (refLook: no size -> 11 pt, Heading 1 16 pt and
// Heading 2 13 pt, bold unless b says otherwise), not ./Fmt's. The
// U+FFFC of a hyperlink (written outside any run) keeps its format.
// Each kind of command is counted (run, and changed the document).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as FS from '../../tools/moreapps/!Word/FormatSet';
import * as F from '../../tools/moreapps/!Word/Format';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {resolveRun, resolvePara, addStyle}
  from '../../tools/moreapps/!Word/Styles';
import {runFmt, fontName} from '../../tools/moreapps/!Word/Fmt';
import {deepEqual} from '../../tools/moreapps/!Word/Model';
import {rng} from './word-docs.mjs';
import {mk, blocks, valid, snap, box, raw, O, S, plain}
  from './edit-docs.mjs';
import {blockId} from '../../tools/moreapps/!Word/DocPos';

const FMTS = [plain, {b: true, extra: []}, {i: true, extra: []},
  {u: 'double', sz: 30, extra: []}, {vertAlign: 'superscript',
    color: '00FF00', extra: []}, {b: false, strike: true, extra: []}];
const FIELDS = ['b', 'i', 'u', 'strike', 'sz', 'color', 'highlight',
  'vertAlign'];
const pick = (r, list) => list[Math.floor(r() * list.length)];

/** A random paragraph (runs of random formats, maybe a link). */
function randPara(r) {
  const n = Math.floor(r() * 4);
  let text = '';
  const runs = [], inlines = {};
  for (let k = 0; k < n; k++) {
    const t = pick(r, ['ab', 'c d', 'hello', O]);
    if (t === O) inlines[text.length] = raw('hyperlink', 'p', 'l');
    const rPr = pick(r, FMTS);
    const last = runs[runs.length - 1];
    if (last && deepEqual(last.rPr, rPr)) last.end += t.length;
    else runs.push({start: text.length, end: text.length + t.length,
      rPr});
    text += t;
  }
  const o = {runs, inlines};
  if (r() < 0.3) o.pStyle = 'Heading1';
  return [text, o];
}

/** Styles for the test: Centered, Strong; with noSize no sizes. */
function setStyles(d, noSize) {
  const st = structuredClone(d.doc.styles);
  addStyle(st, {id: 'Centered', type: 'paragraph', name: 'Centered',
    basedOn: 'Normal', pPr: {jc: 'center', extra: []}});
  addStyle(st, {id: 'Strong', type: 'character', name: 'Strong',
    rPr: {b: true, extra: []}});
  if (noSize) {
    delete st.docDefaults.rPr.sz;
    delete st.docDefaults.rPr.szCs;
    for (const id of ['Heading1', 'Heading2']) {
      const h = st.styles.get(id);
      for (const k of ['sz', 'szCs', 'b']) delete h.rPr[k];
    }
  }
  d.doc.styles = st;
}

// ---- the reference ------------------------------------------------

const cu = (v) => (typeof v === 'string' && v !== 'none' ? v : 'none');
const cv = (v) => (v === 'superscript' || v === 'subscript' ? v
  : 'baseline');
const cc = (v) => (typeof v === 'string' && /^[0-9a-f]{6}$/i.test(v)
  ? v.toUpperCase() : 'auto');

/** The style-given rPr of a character of paragraph para. */
const inhOf = (styles, para, ch) => resolveRun(styles,
  {pStyle: para.style}, ch.rStyle === undefined ? {rPr: plain}
    : {rPr: plain, rStyle: ch.rStyle});

// the heading rule, as Word shows a heading with no size of its own
const HEAD_PT = {Heading1: 16, Heading2: 13};

/** {pt, bold} of resolved rPr r in paragraph para (see header). */
function refLook(para, r) {
  if (Number.isInteger(r.sz) && r.sz > 0) {
    return {pt: r.sz / 2, bold: r.b === true};
  }
  const h = HEAD_PT[para.style];
  return {pt: h || 11, bold: r.b === true || (!!h && r.b === undefined)};
}

/** What a character looks like: the values Format.query gives. */
function effOf(styles, para, ch) {
  const inh = inhOf(styles, para, ch);
  const r = {...inh};
  for (const f of FIELDS) if (f in ch.ov) r[f] = ch.ov[f];
  if ('family' in ch.ov) {
    r.rFonts = {...inh.rFonts, ascii: ch.ov.family,
      hAnsi: ch.ov.family};
  }
  const look = refLook(para, r);
  return {bold: look.bold, italic: r.i === true,
    underline: cu(r.u) !== 'none', strike: r.strike === true,
    size: look.pt, family: fontName(r), color: cc(r.color),
    highlight: typeof r.highlight === 'string' ? r.highlight : 'none',
    vert: cv(r.vertAlign)};
}

const CANON = {b: (v) => v === true, i: (v) => v === true,
  strike: (v) => v === true, u: cu, vertAlign: cv, color: cc,
  highlight: (v) => (typeof v === 'string' ? v : 'none'),
  sz: (v) => (v === undefined ? null : v)};

/** Set direct field f of ch to v, by the commands' rules. */
function setField(styles, para, ch, f, v) {
  const ov = ch.ov;
  if (f === 'family') { ov.family = v; return; }
  if (f === 'b') {
    delete ov.b;
    if (effOf(styles, para, ch).bold !== v) ov.b = v;
    return;
  }
  const was = effOf(styles, para, ch).bold;
  const inh = inhOf(styles, para, ch);
  if (f === 'sz') {
    // a size the style chain gives is not written (one only !Word's
    // display default gives is); a size change keeps the text as
    // bold as it was (b only when needed)
    const szOf = () => ('sz' in ov ? ov.sz : inh.sz);
    const before = szOf();
    if (inh.sz !== undefined && v === inh.sz) delete ov.sz;
    else ov.sz = v;
    if (szOf() !== before) setField(styles, para, ch, 'b', was);
    return;
  }
  if (CANON[f](v) === CANON[f](inh[f])) delete ov[f];
  else ov[f] = v;
}

/** The reference of a document: per block null or {style, jc, ch}. */
function refOf(d) {
  return blocks(d).map((p) => {
    if (p.type !== 'p') return null;
    const ch = [];
    for (const run of p.runs) {
      const ov = {};
      for (const f of FIELDS) if (f in run.rPr) ov[f] = run.rPr[f];
      for (let i = run.start; i < run.end; i++) {
        const x = p.inlines[i];
        const c = {rStyle: run.rStyle, ov: {...ov}};
        if (x && x.level === 'p') c.hole = true;
        ch.push(c);
      }
    }
    return {style: p.pStyle, jc: p.pPr.jc, ch};
  });
}

/** Each selected character: fn(ch, para). */
function eachChar(ref, [k1, o1, k2, o2], fn) {
  for (let k = k1; k <= k2; k++) {
    const p = ref[k];
    if (!p) continue;
    const a = k === k1 ? o1 : 0, b = k === k2 ? o2 : p.ch.length;
    for (let i = a; i < b; i++) if (!p.ch[i].hole) fn(p.ch[i], p);
  }
}

/** The paragraphs paragraph formatting applies to. */
function eachPara(ref, [k1, o1, k2, o2], fn) {
  for (let k = k1; k <= k2; k++) {
    if (!ref[k] || (k === k2 && k2 > k1 && o2 === 0)) continue;
    fn(ref[k]);
  }
}

// ---- one step -------------------------------------------------------

const TOGGLES = {bold: ['b', true, false], italic: ['i', true, false],
  underline: ['u', 'single', 'none'], strike: ['strike', true, false],
  superscript: ['vertAlign', 'superscript', 'baseline'],
  subscript: ['vertAlign', 'subscript', 'baseline']};
const HAS = {bold: (e) => e.bold, italic: (e) => e.italic,
  underline: (e) => e.underline, strike: (e) => e.strike,
  superscript: (e) => e.vert === 'superscript',
  subscript: (e) => e.vert === 'subscript'};

/** A random command on d and st.cur; 'cmd', 'undo', 'redo', 'none'. */
function step(r, d, st) {
  const ref = st.cur, styles = d.doc.styles;
  const bs = blocks(d);
  const rk = () => Math.floor(r() * bs.length);
  const ro = (k) => Math.floor(r() * ((bs[k].type === 'p'
    ? bs[k].text.length : 1) + 1));
  let k1 = rk(), k2 = rk();
  if (k2 < k1) [k1, k2] = [k2, k1];
  let o1 = ro(k1), o2 = ro(k2);
  if (k1 === k2 && o2 < o1) [o1, o2] = [o2, o1];
  const id = (k) => blockId(bs[k]);
  const a = {id: id(k1), off: o1}, h = {id: id(k2), off: o2};
  const sel = r() < 0.5 ? S.select(a, h) : S.select(h, a);
  const span = [k1, o1, k2, o2];
  const caret = k1 === k2 && o1 === o2;
  const chars = (fn) => { if (!caret) eachChar(ref, span, fn); };
  const paras = (fn) => eachPara(ref, span, fn);
  const set = (f, v) => chars((ch, p) => setField(styles, p, ch, f, v));
  const t = new Typing(d);
  const x = st.redo.length && r() < 0.3 ? 1 : r();
  if (x < 0.25) {
    const key = pick(r, Object.keys(TOGGLES));
    st.kind = 'toggle';
    FS.toggle(d, t, sel, key);
    let all = true, any = false;
    chars((ch, p) => {
      any = true;
      all = all && HAS[key](effOf(styles, p, ch));
    });
    const [f, on, off] = TOGGLES[key];
    set(f, any && all ? off : on);
  } else if (x < 0.45) {
    const [f, v] = pick(r, [['sz', 16], ['sz', 22], ['sz', 40],
      ['color', 'FF0000'], ['color', 'auto'], ['color', '00ff00'],
      ['highlight', 'yellow'], ['highlight', 'none'],
      ['rFonts', 'Arial'], ['rFonts', 'Calibri']]);
    st.kind = 'setChar';
    FS.setChar(d, t, sel, {[f]: v});
    if (f === 'rFonts') set('family', v);
    else if (f === 'sz') set(f, v);
    else set(f, v === 'auto' || v === 'none' ? v : f === 'color'
      ? v.toUpperCase() : v);
  } else if (x < 0.52) {
    const n = r() < 0.5 ? 1 : -1;
    st.kind = 'sizeBy';
    FS.sizeBy(d, t, sel, n);
    chars((ch, p) => setField(styles, p, ch, 'sz', Math.round(
      FS.stepSize(effOf(styles, p, ch).size, n) * 2)));
  } else if (x < 0.58) {
    st.kind = 'clearFormat';
    FS.clearFormat(d, t, sel);
    chars((ch) => { ch.ov = {}; ch.rStyle = undefined; });
  } else if (x < 0.66) {
    const s = pick(r, ['Heading1', 'Heading2', 'Normal', 'Centered']);
    st.kind = 'paraStyle';
    FS.applyStyle(d, t, sel, s);
    paras((p) => { p.style = s === 'Normal' ? undefined : s; });
  } else if (x < 0.71) {
    const s = pick(r, ['Strong', 'DefaultParagraphFont']);
    st.kind = 'charStyle';
    FS.applyStyle(d, t, sel, s);
    chars((ch) => {
      ch.rStyle = s === 'Strong' ? s : undefined;
    });
  } else if (x < 0.78) {
    const jc = pick(r, ['left', 'center', 'right', 'both']);
    st.kind = 'setPara';
    FS.setPara(d, t, sel, {jc});
    paras((p) => {
      const inh = resolvePara(styles, {pStyle: p.style, pPr: plain});
      p.jc = alignOf(jc) === alignOf(inh.jc) ? undefined : jc;
    });
  } else if (x < 0.88) {
    if (!d.undo()) return 'none';
    st.redo.push(st.cur);
    st.cur = st.undo.pop();
    return 'undo';
  } else {
    if (!d.redo()) return 'none';
    st.undo.push(st.cur);
    st.cur = st.redo.pop();
    return 'redo';
  }
  return 'cmd';
}

const ALIGN = {center: 'center', right: 'right', both: 'both'};
const alignOf = (jc) => ALIGN[jc] || 'left';

// ---- the checks -----------------------------------------------------

const px = (pt) => Math.round(Math.min(Math.max(pt, 4), 200) * 4 / 3 *
  100) / 100;

/** Everything d shows agrees with the reference ref. */
function agree(d, ref, msg) {
  const styles = d.doc.styles;
  const bs = blocks(d);
  assert.equal(bs.length, ref.length, msg);
  bs.forEach((p, k) => {
    const rp = ref[k];
    if (!rp) { assert.equal(p.type, 'opaque', msg); return; }
    assert.equal(p.pStyle, rp.style, msg + ' style ' + k);
    const inh = resolvePara(styles, {pStyle: rp.style, pPr: plain});
    const align = alignOf(rp.jc !== undefined ? rp.jc : inh.jc);
    const id = blockId(p);
    const q = F.query(d.doc, S.caret({id, off: 0}));
    assert.equal(q.align, align, msg + ' align ' + k);
    assert.equal(q.style, rp.style || 'Normal', msg);
    for (const run of p.runs) {
      const drawn = runFmt(styles, p, run);
      for (let i = run.start; i < run.end; i++) {
        const want = effOf(styles, rp, rp.ch[i]);
        const where = msg + ' block ' + k + ' char ' + i;
        assert.equal(drawn.bold, want.bold, where + ' drawn bold');
        assert.equal(drawn.italic, want.italic, where);
        // superscript and subscript are drawn at 0.65 of the size
        const full = px(want.size);
        assert.equal(drawn.px, want.vert === 'superscript' ||
          want.vert === 'subscript' ? Math.round(full * 0.65 * 100) / 100
          : full, where + ' drawn size');
        // (a hyperlink's U+FFFC alone: no character to query)
        if (rp.ch[i].hole) continue;
        const got = F.query(d.doc, S.select({id, off: i},
          {id, off: i + 1}));
        for (const f of Object.keys(want))
          assert.equal(got[f], want[f], where + ' query ' + f);
      }
    }
  });
}

describe('formatting commands: random sequences', () => {
  it('300 sequences x 20 commands agree with the reference', () => {
    const r = rng(20261007);
    const count = {cmd: 0, changed: 0, undo: 0, redo: 0, none: 0,
      noSize: 0};
    const kinds = {};
    for (let seq = 0; seq < 300; seq++) {
      const list = [];
      const n = 1 + Math.floor(r() * 5);
      for (let k = 0; k < n; k++) {
        list.push(r() < 0.15 ? box() : randPara(r));
      }
      const d = mk(list);
      const noSize = r() < 0.4;
      count.noSize += noSize;
      setStyles(d, noSize);
      const before = snap(d);
      const st = {cur: refOf(d), undo: [], redo: []};
      agree(d, st.cur, 'seq ' + seq + ' start');
      for (let j = 0; j < 20; j++) {
        const depth = d.undoDepth;
        const prev = st.cur;
        st.cur = structuredClone(prev);
        st.kind = null;
        const kind = step(r, d, st);
        count[kind]++;
        if (st.kind) {
          const k = kinds[st.kind] ||= {run: 0, changed: 0};
          k.run++;
          if (d.undoDepth > depth) k.changed++;
        }
        if (kind === 'cmd' && d.undoDepth > depth) {
          count.changed++;
          st.undo.push(prev);
          st.redo = [];
        }
        if (kind === 'none') st.cur = prev;
        const msg = 'seq ' + seq + ' step ' + j;
        valid(d);
        agree(d, st.cur, msg);
      }
      while (d.undo());
      assert.ok(deepEqual(d.doc.sections, before), 'undo ' + seq);
    }
    // the sequences really format, undo and redo, in both kinds
    assert.ok(count.changed > 2000, JSON.stringify(count));
    assert.ok(count.undo > 300 && count.redo > 150,
      JSON.stringify(count));
    assert.ok(count.noSize > 80, JSON.stringify(count));
    // and every kind of command ran and changed documents
    for (const k of ['toggle', 'setChar', 'sizeBy', 'clearFormat',
      'paraStyle', 'charStyle', 'setPara']) {
      assert.ok(kinds[k] && kinds[k].run > 200 && kinds[k].changed > 50,
        k + ' ' + JSON.stringify(kinds));
    }
  });
});
