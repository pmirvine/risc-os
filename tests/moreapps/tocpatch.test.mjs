// TocPatch (Batch E3): the Table of Contents box's values read from
// the table at the caret (or the defaults), the options and the
// instruction they make (Word's order), and TocCmd editToc: the
// box's Update (the code changed and the table made again, one undo
// step). Real Document with the fake measurer.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {fill, patch, DEFAULTS, LEADERS, styleChoices}
  from '../../tools/moreapps/!Letters/TocPatch';
import {insertToc, editToc, updateToc, tocAt}
  from '../../tools/moreapps/!Letters/TocCmd';
import {entriesOf, tocFields}
  from '../../tools/moreapps/!Letters/TocUpdate';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {caret, select}
  from '../../tools/moreapps/!Letters/Selection';
import {updateRangeCmd} from '../../tools/moreapps/!Letters/FieldCmd';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {deepEqual} from '../../tools/moreapps/!Letters/Model';
import {loadStyles, tm} from './word-docs.mjs';
import {buildDocx, documentXml, stylesXml, p, r}
  from './build-docx.mjs';
import {fld} from './field-fixtures.mjs';
import {lintAfter} from './lint-after.mjs';

before(loadStyles);
const NOW = new Date(2026, 9, 30, 9, 0);
const sty = (id, name, inner = '', based = '') => '<w:style ' +
  `w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>` +
  (based ? `<w:basedOn w:val="${based}"/>` : '') +
  `<w:pPr>${inner}</w:pPr></w:style>`;
const OL = (n) => `<w:outlineLvl w:val="${n}"/>`;
const STYLES = stylesXml(sty('Normal', 'Normal') +
  sty('Heading1', 'heading 1', OL(0), 'Normal') +
  sty('Heading2', 'heading 2', OL(1), 'Normal') +
  sty('Heading3', 'heading 3', OL(2), 'Normal') +
  sty('Quote', 'Quote', '', 'Normal'));
const H = (n, text) => p(r(text), `<w:pStyle w:val="Heading${n}"/>`);
const Q = (text) => p(r(text), '<w:pStyle w:val="Quote"/>');
const read = async (body) => readDocx(await buildDocx({
  'word/document.xml': documentXml(body), 'word/styles.xml': STYLES}));
const open = (doc) => {
  const d = new Document(doc);
  return {d, t: new Typing(d)};
};
function ctxOf(doc) {
  const L = new DocLayout(doc, tm(), null, {fields: {now: NOW}});
  L.layout(800);
  const P = new Pages(printGalley(L)).finish();
  return {now: NOW, pages: {finish: () => P}, layout: {L, P}};
}
const blocks = (d) => d.doc.sections[0].blocks;
const plainOf = (b) => b.text.split(OBJ).join('');
const BODY = () => p('') + H(1, 'One') + p(r('body')) + H(2, 'Two') +
  H(3, 'Three') + Q('Said');
const brief = (doc, f) => entriesOf(doc, f).map((e) => [e.level,
  e.text]);
/** A caret inside the first TOC's result. */
function inToc(doc) {
  const f = tocFields(doc)[0];
  return caret({id: f.sep.id, off: f.sep.off + 1});
}
/** The box's fields of values (what the user sees). */
const shown = (v) => ({levels: v.levels, pageNumbers: v.pageNumbers,
  rightAlign: v.rightAlign, leader: v.leader,
  hyperlinks: v.hyperlinks, outline: v.outline,
  extraStyles: v.extraStyles});

describe('fill: no table at the caret', () => {
  it('the defaults (3 levels, links, dots, page numbers)',
    async () => {
      const doc = await read(BODY());
      const v = fill(doc, caret({id: doc.sections[0].blocks[0].id,
        off: 0}));
      assert.equal(v.editing, false);
      assert.deepEqual(shown(v), {levels: 3, pageNumbers: true,
        rightAlign: true, leader: 'dots', hyperlinks: true,
        outline: true, extraStyles: []});
      assert.deepEqual(shown(DEFAULTS), shown(v));
      assert.equal(v.why, null);
      assert.deepEqual(LEADERS.map((x) => x.id),
        ['none', 'dots', 'dashes', 'line']);
    });
  it('no selection: the defaults', async () => {
    const v = fill(await read(BODY()), null);
    assert.equal(v.editing, false);
    assert.equal(v.levels, 3);
  });
});

describe('patch: the instruction Word writes', () => {
  it('the defaults: TOC \\o "1-3" \\h \\z \\u', () => {
    const r1 = patch({...DEFAULTS});
    assert.equal(r1.opts.instr, 'TOC \\o "1-3" \\h \\z \\u');
    assert.equal(r1.opts.leader, 'dot');
  });
  it('every switch the box writes, in Word\'s order', () => {
    const I = (o) => patch({...DEFAULTS, ...o}).opts.instr;
    assert.equal(I({levels: 5}), 'TOC \\o "1-5" \\h \\z \\u');
    assert.equal(I({pageNumbers: false}),
      'TOC \\o "1-3" \\n "1-3" \\h \\z \\u');
    assert.equal(I({rightAlign: false}),
      'TOC \\o "1-3" \\p " " \\h \\z \\u');
    assert.equal(I({hyperlinks: false}), 'TOC \\o "1-3" \\u');
    assert.equal(I({outline: false}), 'TOC \\o "1-3" \\h \\z');
    assert.equal(I({extraStyles: [{style: 'Quote', level: 2}]}),
      'TOC \\o "1-3" \\h \\z \\t "Quote,2" \\u');
    assert.equal(I({levels: 9, pageNumbers: false, hyperlinks: false,
      outline: false, extraStyles: [{style: 'A', level: 1},
        {style: 'B', level: 4}]}),
    'TOC \\o "1-9" \\n "1-9" \\t "A,1,B,4"');
  });
  it('the leaders as TocCmd takes them', () => {
    const L = (leader) => patch({...DEFAULTS, leader}).opts.leader;
    assert.deepEqual(['none', 'dots', 'dashes', 'line'].map(L),
      ['none', 'dot', 'hyphen', 'underscore']);
  });
  it('refused: levels not 1..9, a bad leader, a bad style', () => {
    for (const levels of [0, 10, 2.5, 'x', null, NaN]) {
      const e = patch({...DEFAULTS, levels}).error;
      assert.match(e, /Show levels/, String(levels));
    }
    assert.match(patch({...DEFAULTS, leader: 'zig'}).error, /leader/);
    for (const x of [[{style: '', level: 1}], [{style: 'A', level: 0}],
      [{style: 'A', level: 10}], [{style: 'A"B', level: 1}],
      [{style: 'A', level: 1}, {style: 'a', level: 2}], 'A,1']) {
      assert.ok(patch({...DEFAULTS, extraStyles: x}).error,
        JSON.stringify(x));
    }
    assert.ok(patch(null).error);
  });
});

describe('fill and patch round trip on a table put in', () => {
  const cases = [
    {}, {levels: 1}, {levels: 2}, {levels: 9},
    {pageNumbers: false}, {rightAlign: false},
    {leader: 'none'}, {leader: 'dashes'}, {leader: 'line'},
    {hyperlinks: false}, {outline: false},
    {extraStyles: [{style: 'Quote', level: 2}]},
    {levels: 4, hyperlinks: false, outline: false, leader: 'line',
      extraStyles: [{style: 'Quote', level: 1}]},
  ];
  for (const c of cases) {
    it(JSON.stringify(c), async () => {
      const doc = await read(BODY()), {d, t} = open(doc);
      const vals = {...DEFAULTS, ...c};
      const pt = patch(vals);
      assert.ok(pt.opts, pt.error);
      const res = insertToc(d, t, caret({id: blocks(d)[0].id,
        off: 0}), pt.opts, ctxOf(d.doc));
      assert.ok(res, 'inserted');
      assert.equal(tocFields(d.doc)[0].instr.trim(), pt.opts.instr);
      const v = fill(d.doc, inToc(d.doc));
      assert.equal(v.editing, true);
      assert.equal(v.exact, true);
      const want = shown(vals), got = shown(v);
      if (!vals.pageNumbers || !vals.rightAlign) {
        delete want.leader;
        delete got.leader;
      }
      assert.deepEqual(got, want);
      // unchanged: the code is kept as it is
      const f = tocAt(d.doc, inToc(d.doc));
      assert.equal(patch(v, f).opts.instr, null);
      await lintAfter(d.doc, 'round trip');
    });
  }
});

describe('patch with the table at the caret', () => {
  it('a change: the whole instruction from the box', async () => {
    const doc = await read(BODY()), {d, t} = open(doc);
    insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}), {});
    const f = tocFields(d.doc)[0], v = fill(d.doc, inToc(d.doc));
    assert.equal(patch({...v, levels: 2}, f).opts.instr,
      'TOC \\o "1-2" \\h \\z \\u');
    // only the leader: the code kept, the leader changed
    const o = patch({...v, leader: 'none'}, f).opts;
    assert.equal(o.instr, null);
    assert.equal(o.leader, 'none');
  });
  it('switches the box cannot show: kept when nothing changes, ' +
    'refused when something does', async () => {
    const doc = await read(p(fld('TOC \\o "2-3" \\h \\z \\u',
      'x')) + H(1, 'One') + H(2, 'Two'));
    const f = tocFields(doc)[0];
    const v = fill(doc, caret({id: f.sep.id, off: f.sep.off + 1}));
    assert.equal(v.editing, true);
    assert.equal(v.exact, false);
    assert.equal(v.levels, 3);
    assert.equal(patch(v, f).opts.instr, null);
    assert.match(patch({...v, levels: 4}, f).error, /Field box/);
  });
  it('a table of figures keeps its \\c', async () => {
    const doc = await read(p(fld('TOC \\h \\z \\c "Figure"', 'x')));
    const f = tocFields(doc)[0];
    const v = fill(doc, caret({id: f.sep.id, off: f.sep.off + 1}));
    assert.equal(v.seqId, 'Figure');
    assert.equal(v.exact, true);
    assert.equal(patch(v, f).opts.instr, null);
    assert.equal(patch({...v, hyperlinks: false}, f).opts.instr,
      'TOC \\c "Figure"');
  });
  it('why: a locked table, TC entries', async () => {
    const a = await read(p(fld('TOC \\o "1-3"', 'x', {lock: true})));
    const fa = tocFields(a)[0];
    assert.equal(fill(a, caret({id: fa.sep.id, off: fa.sep.off + 1}))
      .why, 'locked');
    const b = await read(p(fld('TOC \\o "1-3" \\f', 'x')));
    const fb = tocFields(b)[0];
    assert.equal(fill(b, caret({id: fb.sep.id, off: fb.sep.off + 1}))
      .why, 'TC entries');
  });
});

describe('editToc: the box\'s Update', () => {
  it('fewer levels: the code and the entries, one undo step',
    async () => {
      const doc = await read(BODY()), {d, t} = open(doc);
      insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}), {},
        ctxOf(d.doc));
      const before = structuredClone(d.doc.sections);
      const f = tocFields(d.doc)[0], n = d.undoDepth;
      const v = fill(d.doc, inToc(d.doc));
      const o = patch({...v, levels: 2}, f).opts;
      const res = editToc(d, t, f, o, ctxOf(d.doc), inToc(d.doc));
      assert.ok(res);
      assert.equal(res.changed, true);
      assert.equal(d.undoDepth, n + 1);
      const g = tocFields(d.doc)[0];
      assert.equal(g.instr.trim(), 'TOC \\o "1-2" \\h \\z \\u');
      assert.deepEqual(brief(d.doc, g), [[1, 'One'], [2, 'Two']]);
      assert.deepEqual(res.sel.head, {id: g.begin.id,
        off: g.begin.off});
      await lintAfter(d.doc, 'edited');
      d.undo();
      assert.ok(deepEqual(d.doc.sections, before), 'undo');
    });
  it('the leader only: the code kept, the tabs changed', async () => {
    const doc = await read(BODY()), {d, t} = open(doc);
    insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}), {});
    const f = tocFields(d.doc)[0], code = f.instr;
    const v = fill(d.doc, inToc(d.doc));
    const res = editToc(d, t, f, patch({...v, leader: 'line'}, f)
      .opts);
    assert.ok(res && res.changed);
    const g = tocFields(d.doc)[0];
    assert.equal(g.instr, code);
    assert.equal(fill(d.doc, inToc(d.doc)).leader, 'line');
  });
  it('a Quote style at level 2 makes an entry', async () => {
    const doc = await read(BODY()), {d, t} = open(doc);
    insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}), {});
    const f = tocFields(d.doc)[0];
    const v = fill(d.doc, inToc(d.doc));
    const o = patch({...v, extraStyles: [{style: 'Quote', level: 2}]},
      f).opts;
    assert.ok(editToc(d, t, f, o));
    assert.deepEqual(brief(d.doc, tocFields(d.doc)[0]), [[1, 'One'],
      [2, 'Two'], [3, 'Three'], [2, 'Said']]);
  });
  it('nothing changed: no undo step', async () => {
    const doc = await read(BODY()), {d, t} = open(doc);
    insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}), {});
    const f = tocFields(d.doc)[0], n = d.undoDepth;
    const v = fill(d.doc, inToc(d.doc));
    const res = editToc(d, t, f, patch(v, f).opts);
    assert.ok(res);
    assert.equal(res.changed, false);
    assert.equal(d.undoDepth, n);
  });
  it('refused (locked): null, nothing changed', async () => {
    const doc = await read(p(fld('TOC \\o "1-3"', 'x', {lock: true}))
      + H(1, 'One'));
    const {d, t} = open(doc), f = tocFields(d.doc)[0];
    const s = structuredClone(d.doc.sections), n = d.undoDepth;
    assert.equal(editToc(d, t, f, {instr: 'TOC \\o "1-2"'}), null);
    assert.equal(d.undoDepth, n);
    assert.ok(deepEqual(d.doc.sections, s));
  });
});

describe('updateToc with a selection', () => {
  it('gives the selection back moved', async () => {
    const doc = await read(BODY()), {d, t} = open(doc);
    insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}), {},
      ctxOf(d.doc));
    const f = tocFields(d.doc)[0], sel = inToc(d.doc);
    const u = updateToc(d, t, f, 'pages', ctxOf(d.doc), sel);
    assert.ok(u);
    assert.ok(u.sel && u.sel.head, 'a selection');
    assert.ok(findBlock(d.doc, u.sel.head.id), 'still in the text');
  });
});

describe('styleChoices: the Options box\'s styles', () => {
  it('paragraph styles by name, no headings or TOC n, extras kept',
    async () => {
      const doc = await read(BODY());
      const xs = styleChoices(doc, [{style: 'Gone', level: 2}])
        .map((x) => x.text);
      assert.ok(xs.includes('Quote'));
      assert.ok(xs.includes('Normal'));
      assert.ok(xs.includes('Gone'));
      assert.ok(!xs.some((x) => /^heading [1-9]$/i.test(x)), xs);
      assert.deepEqual(xs, [...xs].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())));
    });
});

describe('patch: switches the box cannot show are never dropped',
  () => {
    const codes = ['TOC \\o "1-3" \\b mark \\h \\z \\u',
      'TOC \\o "1-3" \\w \\h \\z \\u', 'TOC \\o "1-3" \\x \\h \\z \\u',
      'TOC \\o "1-3" \\d "-" \\h \\z \\u'];
    for (const code of codes) {
      it(code, async () => {
        const doc = await read(p(fld(code, 'x')) + H(1, 'One'));
        const f = tocFields(doc)[0];
        const v = fill(doc, caret({id: f.sep.id, off: f.sep.off + 1}));
        assert.equal(v.exact, false);
        assert.equal(patch(v, f).opts.instr, null, 'unchanged: kept');
        for (const ch of [{levels: 2}, {hyperlinks: false},
          {outline: false}, {pageNumbers: false}, {rightAlign: false},
          {extraStyles: [{style: 'Quote', level: 1}]}]) {
          const r1 = patch({...v, ...ch}, f);
          assert.ok(r1.error, JSON.stringify(ch));
          assert.match(r1.error, /Field box/);
          assert.equal(r1.opts, undefined);
        }
      });
    }
  });

describe('editToc: refused after the code went in', () => {
  it('a code whose table cannot be made: rolled back, no step',
    async () => {
      const doc = await read(BODY()), {d, t} = open(doc);
      insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}), {});
      const f = tocFields(d.doc)[0];
      const s = structuredClone(d.doc.sections), n = d.undoDepth;
      const styles = d.doc.styles, can = d.canRedo;
      // (\b names no bookmark: rebuild refuses after the code changed)
      assert.equal(editToc(d, t, f, {instr: 'TOC \\o "1-3" \\b nope'}),
        null);
      assert.equal(d.undoDepth, n, 'no undo step');
      assert.equal(d.canRedo, can);
      assert.ok(deepEqual(d.doc.sections, s), 'the document as it was');
      assert.equal(d.doc.styles, styles);
      // a code that is no code: refused before anything
      assert.equal(editToc(d, t, f, {instr: ''}), null);
      assert.equal(d.undoDepth, n);
      d.undo();
      assert.equal(tocFields(d.doc).length, 0, 'the undo stack intact');
    });
});

describe('updateRangeCmd: Update field over a range', () => {
  const SEQ = () => p(r('Figure ') + fld('SEQ Figure', '7'));
  it('a range over a table and a SEQ field: both, one step',
    async () => {
      const doc = await read(BODY() + SEQ()), {d, t} = open(doc);
      insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}), {},
        ctxOf(d.doc));
      // a heading renamed: only an entire update brings it in
      const h = blocks(d).find((b) => plainOf(b) === 'Two' &&
        b.pStyle === 'Heading2');
      const loc = findBlock(d.doc, h.id);
      t.command(() => d.apply({op: 'replaceText', block: loc.at,
        at: h.text.indexOf('Two') + 3, del: 0, ins: 'X'}));
      const bs = blocks(d), last = bs[bs.length - 1];
      const sel = select({id: bs[0].id, off: 0},
        {id: last.id, off: last.text.length});
      const n = d.undoDepth;
      const out = t.command(() => updateRangeCmd(d, sel,
        ctxOf(d.doc)));
      assert.ok(out);
      assert.equal(d.undoDepth, n + 1, 'one step');
      const g = tocFields(d.doc)[0];
      assert.ok(brief(d.doc, g).some(([, x]) => x === 'TwoX'),
        'the table made again entire');
      const q = blocks(d)[blocks(d).length - 1];
      assert.ok(plainOf(q).endsWith('Figure 1'), plainOf(q));
      await lintAfter(d.doc, 'range update');
    });
  it('no table in the range: as updateCmd', async () => {
    const doc = await read(BODY() + SEQ()), {d, t} = open(doc);
    const bs = blocks(d), last = bs[bs.length - 1];
    const sel = select({id: last.id, off: 0},
      {id: last.id, off: last.text.length});
    const out = t.command(() => updateRangeCmd(d, sel, ctxOf(d.doc)));
    assert.ok(out);
    assert.ok(plainOf(blocks(d)[blocks(d).length - 1])
      .endsWith('Figure 1'));
  });
});
