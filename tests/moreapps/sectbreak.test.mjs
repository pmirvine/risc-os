// SectBreak / SectDeco: Insert > Section break (Next page,
// Continuous) in each place the caret can be, one undo step; the
// section before the break gets a copy of the sectPr (header
// references, rsids), the one after keeps the original with w:type;
// the files written (body sectPr or one in the last paragraph, every
// paragraph its own section, a section ending with a table); Delete
// and Backspace at a break merge the sections (the earlier type) and
// undo writes both sectPrs again byte for byte; the band (18 px
// under the section's last block): drawn, never the caret, a click
// in it the end of the block above; the first section's page width.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {insertSection, deleteBreakAt, markOf, sectLabel}
  from '../../tools/moreapps/!Word/SectBreak';
import {sectDeco, bandPaint, bandOf, inBand, BAND}
  from '../../tools/moreapps/!Word/SectDeco';
import {run, stepEnd} from '../../tools/moreapps/!Word/EditApply';
import {insert} from '../../tools/moreapps/!Word/InsertApply';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {keymap} from '../../tools/moreapps/!Word/Keymap';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {paint} from '../../tools/moreapps/!Word/DocPaint';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {Document} from '../../tools/moreapps/!Word/Document';
import {newPara, newSection, deepEqual}
  from '../../tools/moreapps/!Word/Model';
import {apply} from '../../tools/moreapps/!Word/Ops';
import {mk, texts, P, C, SEL, at, undoable, valid, box, S, snap}
  from './edit-docs.mjs';
import {listDoc, li} from './list-docs.mjs';
import {tm} from './word-docs.mjs';
import {buildDocx, documentXml, p, r, REL} from './build-docx.mjs';
import {xmlEntries} from './docx-compare.mjs';

const DATE = new Date(Date.UTC(2026, 0, 1));
const secTexts = (d) => d.doc.sections.map((s) => s.blocks.map((b) =>
  (b.type === 'p' ? b.text : '#')));
const types = (d) => d.doc.sections.map((s) => s.props.type);

/** Run a command id through EditApply: one undo step, exact undo. */
function cmd(id, d, sel, t = new Typing(d)) {
  const n = d.undoDepth;
  const out = undoable(d, () => run(id, d, t, sel));
  assert.equal(d.undoDepth, n + 1, 'one undo step');
  return out;
}

describe('SectBreak: the commands and their labels', () => {
  it('Keymap rows of menu Insert, no keys', () => {
    for (const [id, label] of [['sectionNext', 'Next page'],
      ['sectionContinuous', 'Continuous']]) {
      const row = keymap.row(id);
      assert.equal(row.menu, 'Insert');
      assert.equal(row.label, label);
      assert.equal(keymap.labelFor(id), '');
    }
  });
  it('sectLabel and markOf', () => {
    assert.equal(sectLabel('nextPage'), 'Section break (Next page)');
    assert.equal(sectLabel('continuous'), 'Section break (Continuous)');
    assert.equal(sectLabel('evenPage'), 'Section break (Even page)');
    assert.equal(sectLabel('oddPage'), 'Section break (Odd page)');
    assert.equal(sectLabel('__proto__'), 'Section break');
    assert.equal(sectLabel(undefined), 'Section break');
    const d = mk(['a']);
    assert.equal(markOf(d.doc, 0), null);
  });
  it('bad ids, types and positions change nothing', () => {
    const d = mk(['abc']);
    const t = new Typing(d);
    const c = C(d, 0, 1);
    assert.equal(insert('sectionX', d, t, c), undefined);
    assert.equal(insert('__proto__', d, t, c), undefined);
    assert.equal(insertSection(d, t, c, 'nextColumn'), undefined);
    assert.equal(insertSection(d, t, c, '__proto__'), undefined);
    assert.equal(insertSection(d, t, null, 'nextPage'), undefined);
    const bad = S.caret({id: 99999, off: 0});
    assert.equal(run('sectionNext', d, t, bad), bad);
    assert.equal(d.undoDepth, 0);
    assert.equal(d.doc.sections.length, 1);
  });
});

describe('SectBreak: inserting', () => {
  it('mid-paragraph: split there, the first half ends the section',
    () => {
      const d = mk(['abcdef', 'g']);
      const old = d.doc.sections[0];
      const s = cmd('sectionNext', d, C(d, 0, 3));
      assert.deepEqual(secTexts(d), [['abc'], ['def', 'g']]);
      assert.deepEqual(at(d, s), [1, 0]);
      const [a, b] = d.doc.sections;
      const {type, ...rest} = b.props;
      assert.equal(type, 'nextPage');
      assert.ok(deepEqual(rest, old.props), 'after: the old props');
      assert.ok(deepEqual(a.props, old.props), 'before: a copy');
      assert.notEqual(a.props, old.props);
      assert.ok(deepEqual(a.raw, old.raw) && deepEqual(b.raw, old.raw));
      valid(d);
    });
  it('at the end: the paragraph ends the section, caret in the new ' +
    'empty one', () => {
    const d = mk(['abc', 'xyz']);
    const s = cmd('sectionContinuous', d, C(d, 0, 3));
    assert.deepEqual(secTexts(d), [['abc'], ['', 'xyz']]);
    assert.deepEqual(at(d, s), [1, 0]);
    assert.deepEqual(types(d), [undefined, 'continuous']);
  });
  it('at the start of a non-empty paragraph: a new empty paragraph ' +
    'before it ends the section', () => {
    const d = mk(['abc']);
    const s = cmd('sectionNext', d, C(d, 0, 0));
    assert.deepEqual(secTexts(d), [[''], ['abc']]);
    assert.deepEqual(at(d, s), [1, 0]);
  });
  it('in an empty paragraph: it ends the section (one added after ' +
    'when it was the last)', () => {
    const d = mk(['', 'x']);
    let s = cmd('sectionNext', d, C(d, 0, 0));
    assert.deepEqual(secTexts(d), [[''], ['x']]);
    assert.deepEqual(at(d, s), [1, 0]);
    const e = mk(['a', '']);
    s = cmd('sectionNext', e, C(e, 1, 0));
    assert.deepEqual(secTexts(e), [['a', ''], ['']]);
    assert.deepEqual(at(e, s), [2, 0]);
  });
  it('a selection is deleted first (forwards and backwards)', () => {
    const d = mk(['abc', 'def', 'ghi']);
    const s = cmd('sectionNext', d, SEL(d, 2, 1, 0, 2));
    assert.deepEqual(secTexts(d), [['ab'], ['hi']]);
    assert.deepEqual(at(d, s), [1, 0]);
  });
  it('at a table\'s edge: an empty paragraph there first', () => {
    const d = mk(['a', box()]);
    const s = cmd('sectionNext', d, C(d, 1, 1));
    assert.deepEqual(secTexts(d), [['a', '#', ''], ['']]);
    assert.deepEqual(at(d, s), [3, 0]);
    const e = mk([box(), 'b']);
    cmd('sectionNext', e, C(e, 0, 0));
    assert.deepEqual(secTexts(e), [[''], ['#', 'b']]);
  });
  it('a list item: both halves stay items', () => {
    const d = listDoc([li('one two', 0)]);
    cmd('sectionNext', d, C(d, 0, 3));
    assert.deepEqual(secTexts(d), [['one'], [' two']]);
    assert.deepEqual(P(d, 0).pPr.numPr, P(d, 1).pPr.numPr);
  });
  it('in a paragraph that already ends a section', () => {
    const d = mk(['ab']);
    const s2 = newSection();
    s2.blocks.push(newPara('cd'));
    s2.props.type = 'continuous';
    d.doc.sections.push(s2);
    cmd('sectionNext', d, C(d, 0, 2));
    assert.deepEqual(secTexts(d), [['ab'], [''], ['cd']]);
    assert.deepEqual(types(d), [undefined, 'nextPage', 'continuous']);
    assert.deepEqual(markOf(d.doc, 0), {type: 'nextPage'});
    assert.deepEqual(markOf(d.doc, 1), {type: 'continuous'});
  });
  it('a raw w:type kept in extra is replaced by the field', () => {
    const d = mk(['abc']);
    const sec = d.doc.sections[0];
    const raw = {name: 'w:type', attrs: [['w:val', 'x'], ['w:y', '1']],
      children: []};
    d.doc.sections[0] = {...sec, props: {...sec.props,
      extra: [...sec.props.extra, raw]}};
    cmd('sectionNext', d, C(d, 0, 1));
    const [a, b] = d.doc.sections;
    assert.ok(a.props.extra.some((n) => n.name === 'w:type'));
    assert.ok(!b.props.extra.some((n) => n.name === 'w:type'));
    assert.equal(b.props.type, 'nextPage');
  });
  it('typing after it is a new undo step; the caret after undo / redo',
    () => {
      const d = mk(['abcdef']);
      const t = new Typing(d);
      let ops = null;
      d.on('change', (ev) => { ops = ev.ops; });
      let L = laid(d);
      const step = (kind) => {
        const old = laid(d, L);
        d[kind]();
        L = laid(d, old);
        return stepEnd(d.doc, ops, old);
      };
      let sel = t.type(C(d, 0, 6), 'g');
      sel = run('sectionNext', d, t, C(d, 0, 3));
      t.type(sel, 'x');
      assert.deepEqual(secTexts(d), [['abc'], ['xdefg']]);
      assert.equal(d.undoDepth, 3);
      step('undo');
      assert.deepEqual(secTexts(d), [['abc'], ['defg']]);
      // undo of the break: the paragraph joined again, caret at it
      assert.deepEqual(step('undo'), {id: P(d, 0).id, off: 3});
      assert.deepEqual(secTexts(d), [['abcdefg']]);
      // redo: the start of the paragraph that ends the first section
      assert.deepEqual(step('redo'), {id: P(d, 0).id, off: 0});
      assert.deepEqual(secTexts(d), [['abc'], ['defg']]);
      // Delete at the break, then undo / redo
      run('delete', d, t, C(d, 0, 3));
      assert.equal(d.doc.sections.length, 1);
      assert.deepEqual(step('undo'), {id: P(d, 0).id, off: 0});
      assert.equal(d.doc.sections.length, 2);
      assert.deepEqual(step('redo'), {id: P(d, 0).id, off: 0});
    });
});

describe('SectBreak: Delete and Backspace at a break', () => {
  function two() {
    const d = mk(['abcdef']);
    run('sectionNext', d, new Typing(d), C(d, 0, 3));
    d.clearHistory();
    return d;
  }
  for (const [id, k, off] of [['delete', 0, 3], ['backspace', 1, 0],
    ['ctrlDelete', 0, 3], ['ctrlBackspace', 1, 0]]) {
    it(id + ' removes the break (one step); again merges paragraphs',
      () => {
        const d = two();
        const sel = C(d, k, off);
        const s = cmd(id, d, sel);
        assert.deepEqual(secTexts(d), [['abc', 'def']]);
        assert.deepEqual(s.head, sel.head);
        assert.equal(d.doc.sections[0].props.type, undefined);
        cmd(id, d, s);
        assert.deepEqual(secTexts(d), [['abcdef']]);
      });
  }
  it('the merged section: the following one\'s props and sectPr, ' +
    'the earlier one\'s type', () => {
    const d = mk(['ab']);
    const a = d.doc.sections[0];
    d.doc.sections[0] = {...a, props: {...a.props, type: 'evenPage',
      pgSz: {w: 1000, h: 2000}}};
    const b = newSection();
    b.blocks.push(newPara('cd'));
    b.props = {pgSz: {w: 3000, h: 4000}, type: 'continuous',
      extra: [{name: 'w:foo', attrs: [], children: []}]};
    b.raw = {name: 'w:sectPr', attrs: [['w:rsidR', '00B1']],
      children: []};
    d.doc.sections.push(b);
    cmd('delete', d, C(d, 0, 2));
    const [m] = d.doc.sections;
    assert.deepEqual(m.props, {...b.props, type: 'evenPage'});
    assert.deepEqual(m.raw, b.raw);
    // none: the type field goes
    const e = mk(['ab']);
    const c = newSection();
    c.blocks.push(newPara('cd'));
    c.props = {type: 'oddPage', extra: []};
    e.doc.sections.push(c);
    cmd('backspace', e, C(e, 1, 0));
    assert.deepEqual(e.doc.sections[0].props, {extra: []});
  });
  it('not at a section edge: undefined, nothing changes', () => {
    const d = two();
    for (const [k, off, dir] of [[0, 2, 1], [0, 0, -1], [1, 1, -1],
      [1, 3, 1], [0, 3, -1], [1, 0, 1], [0, 3, 0]]) {
      assert.equal(deleteBreakAt(d, C(d, k, off), dir), undefined);
    }
    assert.equal(deleteBreakAt(d, SEL(d, 0, 3, 1, 0), 1), undefined);
    assert.equal(deleteBreakAt(d, S.caret({id: 9999, off: 0}), 1),
      undefined);
    assert.equal(d.undoDepth, 0);
  });
  it('a section that ends with a table is not merged', () => {
    const d = mk(['ab', box()]);
    const s2 = newSection();
    s2.blocks.push(newPara('cd'));
    d.doc.sections.push(s2);
    const t = new Typing(d);
    assert.equal(deleteBreakAt(d, C(d, 2, 0), -1), undefined);
    const c = C(d, 2, 0);
    assert.equal(run('backspace', d, t, c), c);
    assert.equal(d.undoDepth, 0);
    assert.equal(d.doc.sections.length, 2);
  });
  it('a list item at a section\'s start: Backspace removes the ' +
    'break first', () => {
    const d = listDoc([li('one', 0), li('two', 0)]);
    run('sectionNext', d, new Typing(d), C(d, 1, 0));
    assert.equal(d.doc.sections.length, 2);
    const k = secTexts(d)[0].length;
    cmd('backspace', d, C(d, k, 0));
    assert.equal(d.doc.sections.length, 1);
    assert.ok(P(d, k).pPr.numPr, 'still an item');
  });
});

// ---- files ------------------------------------------------------------

const kids = (n, name) => (n.children || []).filter((c) => c.name &&
  (name === undefined || c.name === name));
const sectOf = (pEl) => {
  const pPr = kids(pEl, 'w:pPr')[0];
  return pPr ? kids(pPr, 'w:sectPr')[0] || null : null;
};
const HDR = '<w:headerReference w:type="default" r:id="rId9"/>';
const SECT = `<w:sectPr w:rsidR="00C0" w:rsidSect="00C1">${HDR}` +
  '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" ' +
  'w:right="1440" w:bottom="1440" w:left="1440" w:header="708" ' +
  'w:footer="708" w:gutter="0"/><w:foo/></w:sectPr>';
const HEADER = '<?xml version="1.0" encoding="UTF-8"?><w:hdr ' +
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/' +
  'main"><w:p/></w:hdr>';
async function open(body) {
  const bytes = await buildDocx({'word/document.xml': documentXml(body),
    'word/header1.xml': HEADER},
  {docRels: [['rId9', REL('header'), 'header1.xml']]});
  const d = new Document(await readDocx(bytes));
  d.clearHistory();
  return d;
}
const write = (d) => writeDocx(d.doc, {date: DATE});
async function bodyOf(bytes) {
  const root = (await xmlEntries(bytes)).get('word/document.xml').root;
  return kids(root, 'w:body')[0];
}
const attrs = (n) => n.attrs.map((a) => a.join('='));
const names = (n) => kids(n).map((c) => c.name);
const typeOf = (n) => {
  const t = kids(n, 'w:type')[0];
  return t ? t.attrs.find((a) => a[0] === 'w:val')[1] : undefined;
};

describe('SectBreak: the written document', () => {
  it('the copy in the break\'s paragraph; the original sectPr where ' +
    'it was, with w:type; undo / redo / Delete', async () => {
    const d = await open(p(r('one two')) + p(r('three')) + SECT);
    const first = await write(d);
    const orig = kids(await bodyOf(first)).at(-1);
    run('sectionNext', d, new Typing(d), C(d, 0, 3));
    const bytes = await write(d);
    const body = await bodyOf(bytes);
    const ps = kids(body, 'w:p');
    assert.equal(ps.length, 3);
    const copy = sectOf(ps[0]);
    assert.ok(copy, 'paragraph 0 carries the copy');
    assert.ok(deepEqual(copy, orig), 'every child and attribute');
    assert.equal(sectOf(ps[1]), null);
    assert.equal(sectOf(ps[2]), null);
    const last = kids(body).at(-1);
    assert.equal(last.name, 'w:sectPr');
    assert.deepEqual(attrs(last), attrs(orig), 'rsids kept');
    assert.equal(typeOf(last), 'nextPage', 'written explicitly');
    for (const n of names(orig)) assert.ok(names(last).includes(n), n);
    assert.deepEqual(kids(last, 'w:headerReference')[0].attrs,
      kids(orig, 'w:headerReference')[0].attrs, 'the same header');
    const back = await readDocx(bytes);
    assert.equal(back.sections.length, 2);
    assert.equal(back.sections[1].props.type, 'nextPage');
    assert.equal(back.sections[0].props.type, undefined);
    d.undo();
    assert.deepEqual(await write(d), first, 'undo: the old bytes');
    d.redo();
    assert.deepEqual(await write(d), bytes, 'redo: the same bytes');
    // Delete at the break: one section; again: the original bytes
    const t = new Typing(d);
    run('delete', d, t, C(d, 0, 3));
    assert.equal(d.doc.sections.length, 1);
    const once = await write(d);
    run('delete', d, t, C(d, 0, 3));
    assert.deepEqual(await write(d), first, 'merged: the old bytes');
    d.undo();
    assert.deepEqual(await write(d), once);
    d.undo();
    assert.deepEqual(await write(d), bytes,
      'undo of Delete: both sectPrs byte for byte');
  });
  it('a last section whose sectPr is in its last paragraph keeps ' +
    'that placement', async () => {
    const d = await open(p(r('one')) + p(r('two'), SECT));
    assert.equal(d.doc.meta.bodySectPr, false);
    run('sectionContinuous', d, new Typing(d), C(d, 0, 3));
    const body = await bodyOf(await write(d));
    assert.equal(kids(body, 'w:sectPr').length, 0, 'no body sectPr');
    const ps = kids(body, 'w:p');
    assert.equal(ps.length, 3);
    assert.ok(sectOf(ps[0]), 'the copy');
    assert.equal(sectOf(ps[1]), null);
    assert.equal(typeOf(sectOf(ps[2])), 'continuous');
    assert.deepEqual(attrs(sectOf(ps[2])), ['w:rsidR=00C0',
      'w:rsidSect=00C1']);
    const back = await readDocx(await write(d));
    assert.equal(back.sections.length, 2);
    assert.equal(back.meta.bodySectPr, false);
  });
  it('every paragraph its own section: insert and delete in the ' +
    'middle', async () => {
    const mid = (w) => SECT.replace('11906', String(w));
    const d = await open(p(r('aa'), mid(10000)) + p(r('bb'), mid(11000))
      + p(r('cc')) + SECT);
    assert.equal(d.doc.sections.length, 3);
    const first = await write(d);
    run('sectionNext', d, new Typing(d), C(d, 1, 1));
    assert.deepEqual(secTexts(d), [['aa'], ['b'], ['b'], ['cc']]);
    assert.equal(d.doc.sections[1].props.pgSz.w, 11000);
    assert.equal(d.doc.sections[2].props.pgSz.w, 11000);
    let back = await readDocx(await write(d));
    assert.equal(back.sections.length, 4);
    run('backspace', d, new Typing(d), C(d, 1, 0));
    assert.deepEqual(secTexts(d), [['aa', 'b'], ['b'], ['cc']]);
    assert.equal(d.doc.sections[0].props.pgSz.w, 11000);
    back = await readDocx(await write(d));
    assert.equal(back.sections.length, 3);
    while (d.undo());
    assert.deepEqual(await write(d), first);
  });
  it('a section that ends with a table', async () => {
    const tbl = '<w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>';
    const d = await open(p(r('aa')) + tbl + p(r('bb')) + SECT);
    // a break after the table: an empty paragraph carries it
    const t = new Typing(d);
    run('sectionNext', d, t, C(d, 1, 1));
    assert.deepEqual(secTexts(d), [['aa', '#', ''], ['bb']]);
    const back = await readDocx(await write(d));
    assert.equal(back.sections.length, 2);
    assert.deepEqual(back.sections.map((s) => s.blocks.length), [3, 1]);
    // a model section ending with the table (the writer adds a
    // paragraph): Delete / Backspace there do nothing
    const e = mk(['a', box()]);
    const s2 = newSection();
    s2.blocks.push(newPara('b'));
    e.doc.sections.push(s2);
    const c = C(e, 1, 1);
    assert.deepEqual(run('delete', e, new Typing(e), c), c);
    assert.equal(e.undoDepth, 0);
  });
});

// ---- the band ---------------------------------------------------------

function laid(d, prev) {
  const L = new DocLayout(d.doc, tm(), prev);
  L.layout(900);
  return L;
}

describe('SectDeco: the band', () => {
  it('sectDeco, bandOf, inBand, bandPaint', () => {
    assert.equal(sectDeco({mark: null}), null);
    const r0 = sectDeco({mark: {type: 'continuous'}});
    assert.equal(r0.gapBelow, BAND);
    assert.equal(BAND, 18);
    assert.deepEqual({...r0.marks[0]}, {kind: 'section',
      type: 'continuous', label: 'Section break (Continuous)', dy: 0,
      h: 18});
    const it0 = {y: 100, h: 20, marks: r0.marks};
    assert.equal(bandOf(it0), r0.marks[0]);
    assert.equal(bandOf({marks: []}), null);
    assert.ok(!inBand(it0, 119.9) && inBand(it0, 120) &&
      inBand(it0, 137.9) && !inBand(it0, 138));
    const b = bandPaint(r0.marks[0], 600, 100);
    assert.equal(b.label, 250);
    assert.deepEqual(b.dots, [[0, 244], [356, 600]]);
    assert.ok(b.y1 < b.y2 && b.y1 >= 0 && b.y2 < 18);
    assert.equal(bandPaint(r0.marks[0], 100, 90).label, null);
    assert.deepEqual(bandPaint(r0.marks[0], 100, NaN).dots, [[0, 100]]);
  });
  it('under a section\'s last paragraph: 18 px, labelled; the last ' +
    'section has none', () => {
    const d = mk(['abc', 'def', 'ghi']);
    run('sectionContinuous', d, new Typing(d), C(d, 0, 3));
    const L = laid(d);
    const [a, b, c] = L.items;
    assert.equal(a.gapBelow, 18);
    assert.equal(bandOf(a).label, 'Section break (Continuous)');
    assert.equal(b.y, a.y + a.h + 18);
    assert.equal(b.gapBelow, 0);
    assert.equal(bandOf(c), null);
  });
  it('under a kept block that ends a section: under its box', () => {
    const d = mk(['a', box()]);
    const s2 = newSection();
    s2.blocks.push(newPara('b'));
    d.doc.sections.push(s2);
    const L = laid(d);
    const bx = L.items[1];
    assert.equal(bx.kind, 'box');
    assert.equal(bx.gapBelow, 18);
    assert.equal(bandOf(bx).label, 'Section break (Next page)');
    const h = L.hitTest(L.left + 5, bx.y + bx.h + 9);
    assert.deepEqual(h.pos, {id: bx.id, off: 1});
  });
  it('the band never takes the caret; a click in it is the end of ' +
    'the paragraph above', () => {
    const d = mk(['abc def ghi', 'second', 'third']);
    run('sectionNext', d, new Typing(d), C(d, 0, 4));
    run('sectionNext', d, new Typing(d), C(d, 2, 6));
    const L = laid(d);
    const bands = L.items.filter((x) => bandOf(x)).map((x) =>
      [x.y + x.h, x.y + x.h + 18]);
    assert.equal(bands.length, 2);
    for (const it of L.items) {
      for (let off = 0; off <= it.block.text.length; off++) {
        for (const aff of ['up', 'down']) {
          const c = L.caretRect({id: it.id, off}, aff);
          for (const [y0, y1] of bands) {
            assert.ok(c.y + c.h <= y0 || c.y >= y1,
              `caret ${it.id}:${off} in a band`);
          }
        }
      }
    }
    for (const it of L.items.filter((x) => bandOf(x))) {
      for (const dy of [0, 1, 9, 17.5]) {
        for (const x of [0, L.left + 3, L.left + L.textW / 2, 5000]) {
          const h = L.hitTest(x, it.y + it.h + dy);
          assert.deepEqual(h.pos, {id: it.id,
            off: it.block.text.length}, `${x}, ${dy}`);
        }
      }
      const nx = L.items[it.index + 1];
      assert.equal(L.hitTest(L.left + 1, nx.y + 1).pos.id, nx.id);
    }
  });
  it('the first section\'s page width drives the layout', () => {
    const d = mk(['abc', 'def']);
    const w0 = laid(d).textW;
    run('sectionNext', d, new Typing(d), C(d, 0, 3));
    assert.equal(laid(d).textW, w0);
    const s1 = d.doc.sections[1];
    d.apply({op: 'setSection', at: 1, props: {...s1.props,
      pgSz: {w: 20000, h: 16838}}, raw: s1.raw});
    assert.equal(laid(d).textW, w0, 'the second section\'s ignored');
    const s0 = d.doc.sections[0];
    d.apply({op: 'setSection', at: 0, props: {...s0.props,
      pgSz: {w: 20000, h: 16838}}, raw: s0.raw});
    assert.ok(laid(d).textW > w0, 'the first section\'s counts');
  });
});

describe('DocPaint: marks in a gap are drawn', () => {
  /** A canvas context recording fillRect y and fillText texts. */
  function fakeG() {
    const g = {rects: [], texts: [], font: '', fillStyle: '',
      strokeStyle: '', lineWidth: 1, textBaseline: '',
      fillRect: (x, y) => g.rects.push(y),
      fillText: (t) => g.texts.push(t),
      strokeRect() {}, measureText: (t) => ({width: t.length * 6}),
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}};
    return g;
  }
  it('a rect that starts in the band draws it (the item above it ' +
    'is found)', () => {
    const d = mk(['abc', 'def']);
    run('sectionNext', d, new Typing(d), C(d, 0, 3));
    const L = laid(d);
    const a = L.items[0];
    const top = a.y + a.h;
    const g = fakeG();
    paint(L, g, {x0: 0, y0: top + 2, x1: 2000, y1: top + 30});
    assert.ok(g.texts.includes('Section break (Next page)'), g.texts);
    assert.ok(g.rects.some((y) => y >= top && y < top + 18));
    assert.ok(!g.texts.includes('abc'), 'the text above not drawn');
    const h = fakeG();
    paint(L, h, {x0: 0, y0: 0, x1: 2000, y1: top - 1});
    assert.ok(!h.texts.includes('Section break (Next page)'));
    assert.ok(h.texts.some((t) => t.includes('abc')));
  });
});

describe('SectBreak: undo restores everything', () => {
  it('a document deep-equal after undo, with ids', () => {
    const d = mk(['one', 'two three', '']);
    const before = snap(d);
    const t = new Typing(d);
    run('sectionNext', d, t, C(d, 1, 3));
    run('sectionContinuous', d, t, C(d, 0, 0));
    run('sectionNext', d, t, C(d, texts(d).length - 1, 0));
    run('delete', d, t, C(d, 0, 0));
    assert.ok(d.doc.sections.length >= 3);
    while (d.undo());
    assert.ok(deepEqual(d.doc.sections, before));
    void apply;
  });
});

// ---- review fixes ---------------------------------------------------------

const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
async function openRoot(body) {
  const bytes = await buildDocx({'word/document.xml': documentXml(body,
    {rootAttrs: ` xmlns:w14="${W14}" xmlns:mc="${MC}"` +
      ' mc:Ignorable="w14"'}),
  'word/header1.xml': HEADER},
  {docRels: [['rId9', REL('header'), 'header1.xml']]});
  const d = new Document(await readDocx(bytes));
  d.clearHistory();
  return d;
}

describe('SectBreak: hostile original sectPrs', () => {
  const RICH = '<w:sectPr w:rsidR="00C0" w:rsidRPr="00C2" ' +
    'w:rsidSect="00C1" w14:paraId="1A2B3C4D" mc:Ignorable="w14">' +
    '<!-- a comment -->' + HDR + '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:foo w:x="1"><w:bar/></w:foo><w14:extra w14:val="2"/>' +
    '<w:sectPrChange w:id="7" w:author="A" w:date="2026-01-01T00:00:00Z">' +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>' +
    '</w:sectPrChange></w:sectPr>';
  it('the original keeps its attributes and unknown children (an ' +
    'XML comment in it is dropped while it is rebuilt); Delete twice: the original bytes; undo: ' +
    'the bytes with the break', async () => {
    const d = await openRoot(p(r('one two')) + RICH);
    const first = await write(d);
    const orig = kids(await bodyOf(first)).at(-1);
    const isComment = (c) => c.comment !== undefined;
    assert.ok(orig.children.some(isComment), 'as read: written back');
    run('sectionNext', d, new Typing(d), C(d, 0, 3));
    const bytes = await write(d);
    const body = await bodyOf(bytes);
    const last = kids(body).at(-1);
    assert.deepEqual(attrs(last), attrs(orig), 'every attribute');
    // rebuilt from its props (it has a type now): the comment is lost
    assert.ok(!last.children.some(isComment), 'comment dropped');
    for (const n of ['w:headerReference', 'w:pgSz', 'w:foo',
      'w14:extra', 'w:sectPrChange']) {
      assert.ok(deepEqual(kids(last, n), kids(orig, n)), n);
    }
    assert.equal(typeOf(last), 'nextPage');
    const t = new Typing(d);
    run('delete', d, t, C(d, 0, 3));
    run('delete', d, t, C(d, 0, 3));
    assert.deepEqual(await write(d), first, 'merged: the old bytes');
    d.undo();
    d.undo();
    assert.deepEqual(await write(d), bytes, 'undo: byte for byte');
  });
  it('the copy has no w:sectPrChange (revision ids stay unique); the ' +
    'original keeps it', async () => {
    const d = await openRoot(p(r('one two')) + RICH);
    run('sectionNext', d, new Typing(d), C(d, 0, 3));
    assert.ok(!d.doc.sections[0].raw.children.some((c) =>
      c.name === 'w:sectPrChange'));
    assert.ok(!d.doc.sections[0].props.extra.some((c) =>
      c.name === 'w:sectPrChange'));
    const body = await bodyOf(await write(d));
    const copy = sectOf(kids(body, 'w:p')[0]);
    assert.equal(kids(copy, 'w:sectPrChange').length, 0);
    for (const n of ['w:headerReference', 'w:foo', 'w14:extra']) {
      assert.equal(kids(copy, n).length, 1, n);
    }
    assert.equal(kids(kids(body).at(-1), 'w:sectPrChange').length, 1);
    const back = await readDocx(await write(d));
    assert.equal(back.sections.length, 2);
  });
  it('read: a paragraph\'s sectPr with w14 / mc attributes still ' +
    'ends a section (before, it stayed in the pPr\'s extra)', async () => {
    const d = await openRoot(p(r('one'), RICH) + p(r('two')) + SECT);
    assert.equal(d.doc.sections.length, 2);
    assert.ok(!(d.doc.sections[0].blocks[0].pPr.extra || []).some((n) =>
      n.name === 'w:sectPr'));
    assert.deepEqual(attrs(d.doc.sections[0].raw).slice(3),
      ['w14:paraId=1A2B3C4D', 'mc:Ignorable=w14']);
    const first = await write(d);
    const back = await readDocx(first);
    assert.equal(back.sections.length, 2);
    const ps = kids(await bodyOf(first), 'w:p');
    assert.deepEqual(attrs(sectOf(ps[0])), attrs(d.doc.sections[0].raw));
  });
  it('markOf / sectLabel live in SectMark: DocItems and SectDeco do ' +
    'not import the editing modules', async () => {
    const {readFileSync} = await import('node:fs');
    const src = (n) => readFileSync(new URL(
      '../../tools/moreapps/!Word/' + n, import.meta.url), 'latin1');
    for (const n of ['DocItems', 'SectDeco', 'SectMark']) {
      const imp = src(n).split('\n').filter((l) => /^import|from '/.test(l))
        .join('\n');
      assert.ok(!/SectBreak|EditRange|EditPara|EditPos/.test(imp), n);
    }
    const m = await import('../../tools/moreapps/!Word/SectMark');
    assert.equal(m.markOf, markOf);
    assert.equal(m.sectLabel, sectLabel);
  });
});
