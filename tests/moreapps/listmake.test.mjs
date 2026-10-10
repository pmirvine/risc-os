// ListMake: new lists made (Bullets / Numbering: on, off, switched,
// continued after a gap, a new list when the previous one differs),
// Restart / Start at and Continue, each one undo step that restores
// the numbering, relationships, styles and meta exactly; the
// numbering part made when missing and written; hostile numbering
// parts refused (RangeError) without a change; 100,000 paragraphs.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {toggleList, restart, continueList, listKindOf, listEntryOf}
  from '../../tools/moreapps/!Word/ListMake';
import {setList} from '../../tools/moreapps/!Word/FormatList';
import {apply, isFormat} from '../../tools/moreapps/!Word/FormatApply';
import {query} from '../../tools/moreapps/!Word/Format';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {Document} from '../../tools/moreapps/!Word/Document';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {relKind} from '../../tools/moreapps/!Word/Rels';
import {P, C, SEL, mk, blocks, box} from './edit-docs.mjs';
import {listDocx, item, heading, lvl, STYLES_LIST}
  from './list-fixtures.mjs';
import {buildDocx, documentXml, numberingXml, stylesXml, relsXml, REL,
  p, r} from './build-docx.mjs';
import {strictDocx} from './docx-fixtures.mjs';
import {entryText} from './docx-compare.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const write = (doc) => writeDocx(doc, {date: DATE});
const T = (d) => new Typing(d);
const all = (d) => SEL(d, 0, 0, blocks(d).length - 1,
  P(d, blocks(d).length - 1).text.length);
/** Everything a command may change (a deep copy). */
const state = (d) => structuredClone({sections: d.doc.sections,
  numbering: d.doc.numbering, rels: d.doc.rels, styles: d.doc.styles,
  meta: d.doc.meta});
/** Each paragraph's label text (null: none; '#' a kept block). */
const shown = (d) => {
  const m = labels(d.doc);
  return blocks(d).map((b) => (b.type !== 'p' ? '#'
    : m.has(b.id) ? m.get(b.id).text : null));
};
const numPr = (d, k) => P(d, k).pPr.numPr;
const numIds = (d) => blocks(d).map((b) => (b.type === 'p' &&
  b.pPr.numPr ? b.pPr.numPr.numId : null));

/**
 * Run cmd: one undo step (none: none, asserted unchanged; maybe:
 * either); undo gives
 * back the whole state deep-equal, redo the state after.
 */
function step(d, cmd, {none = false, maybe = false} = {}) {
  const before = state(d);
  const n = d.undoDepth;
  const out = cmd();
  if (none || (maybe && d.undoDepth === n)) {
    assert.equal(d.undoDepth, n, 'no undo step');
    assert.deepStrictEqual(state(d), before, 'unchanged');
    return out;
  }
  assert.equal(d.undoDepth, n + 1, 'one undo step');
  const after = state(d);
  d.undo();
  assert.deepStrictEqual(state(d), before, 'undo exact');
  d.redo();
  assert.deepStrictEqual(state(d), after, 'redo exact');
  return out;
}
const tog = (d, sel, kind, entry) => step(d, () => toggleList(d, T(d),
  sel, entry === undefined ? {kind} : {kind, entry}));
const fromFile = async (bytes) => {
  const d = new Document(await readDocx(bytes));
  d.clearHistory();
  return d;
};

describe('ListMake.toggleList: a new list', () => {
  it('in a document without numbering: part, rel, Override written',
    async () => {
      const d = mk(['a', 'b', 'c']);
      assert.equal(d.doc.numbering, null);
      const rels = d.doc.rels;
      const out = tog(d, SEL(d, 0, 0, 2, 1), 'number');
      assert.deepEqual(Object.keys(out), ['sel', 'pending']);
      assert.deepEqual(shown(d), ['1.', '2.', '3.']);
      assert.deepEqual(blocks(d).map((b) => b.pPr.numPr),
        [0, 1, 2].map(() => ({numId: 1, ilvl: 0})));
      assert.deepEqual(blocks(d).map((b) => b.pStyle),
        ['ListParagraph', 'ListParagraph', 'ListParagraph']);
      assert.equal(d.doc.meta.numberingPart, 'word/numbering.xml');
      assert.notEqual(d.doc.rels, rels);
      assert.equal(d.doc.rels.filter((x) => (relKind(x.type) || {})
        .kind === 'numbering').length, 1);
      const bytes = await write(d.doc);
      const ct = await entryText(bytes, '[Content_Types].xml');
      assert.match(ct, /PartName="\/word\/numbering\.xml"/);
      const xml = await entryText(bytes, 'word/numbering.xml');
      assert.match(xml, /<w:num w:numId="1">/);
      const back = new Document(await readDocx(bytes));
      assert.deepEqual(shown(back), shown(d));
      assert.deepEqual(back.doc.numbering.nums, d.doc.numbering.nums);
      // undo: no numbering, the old rels, meta without the part
      d.undo();
      assert.equal(d.doc.numbering, null);
      assert.equal(d.doc.rels, rels);
      assert.ok(!Object.hasOwn(d.doc.meta, 'numberingPart'));
    });

  it('bullets: Word\'s disc by default, an entry when given', () => {
    const d = mk(['a', 'b']);
    tog(d, C(d, 0, 0), 'bullet');
    assert.deepEqual(shown(d), ['\u2022', null]);
    assert.equal(listKindOf(d.doc, P(d, 0)), 'bullet');
    assert.equal(listEntryOf(d.doc, P(d, 0)), 'disc');
    tog(d, C(d, 1, 0), 'bullet', 'check');
    assert.deepEqual(shown(d), ['\u2022', '\u2713']);
    assert.notEqual(numPr(d, 0).numId, numPr(d, 1).numId);
    assert.equal(listEntryOf(d.doc, P(d, 1)), 'check');
    assert.equal(listKindOf(d.doc, P(d, 1)), 'bullet');
  });

  it('a caret formats its paragraph; pending kept for a caret', () => {
    const d = mk(['a']);
    const pend = {rPr: {b: true}};
    const out = tog(d, C(d, 0, 1), 'number');
    assert.deepEqual(out.pending, {});
    d.undo();
    const out2 = toggleList(d, T(d), C(d, 0, 1), {kind: 'number'},
      pend);
    assert.equal(out2.pending, pend);
    const out3 = toggleList(d, T(d), SEL(d, 0, 0, 0, 1),
      {kind: 'number'}, pend);
    assert.deepEqual(out3.pending, {});
  });

  it('continues the previous list of that format after a gap', () => {
    const d = mk(['a', 'b', 'gap', 'gap 2', 'c', 'd']);
    tog(d, SEL(d, 0, 0, 1, 1), 'number');
    tog(d, SEL(d, 4, 0, 5, 1), 'number');
    assert.deepEqual(shown(d), ['1.', '2.', null, null, '3.', '4.']);
    assert.deepEqual(numIds(d), [1, 1, null, null, 1, 1]);
    // one definition only
    assert.equal(d.doc.numbering.nums.size, 1);
  });

  it('a kept block (table) in the gap does not stop it', () => {
    const d = mk(['a', box(), 'b']);
    tog(d, C(d, 0, 0), 'bullet');
    tog(d, C(d, 2, 0), 'bullet');
    assert.deepEqual(numIds(d), [1, null, 1]);
  });

  it('a new list when the previous list is another kind or entry',
    () => {
      const d = mk(['a', 'gap', 'b', 'gap', 'c', 'd']);
      tog(d, C(d, 0, 0), 'number');
      tog(d, C(d, 2, 0), 'bullet');
      assert.notEqual(numPr(d, 2).numId, numPr(d, 0).numId);
      // the nearest list paragraph (bullets) decides: a new numbering
      tog(d, C(d, 4, 0), 'number');
      assert.deepEqual(shown(d), ['1.', null, '\u2022', null, '1.',
        null]);
      assert.equal(new Set(numIds(d).filter((x) => x)).size, 3);
      // another entry of the same kind: a new list too
      tog(d, C(d, 5, 0), 'number', 'a)');
      assert.equal(shown(d)[5], 'a)');
      assert.equal(new Set(numIds(d).filter((x) => x)).size, 4);
    });

  it('only the same section continues', () => {
    const doc = mk(['a', 'b', 'c']).doc;
    const s0 = doc.sections[0];
    doc.sections = [{...s0, blocks: s0.blocks.slice(0, 2)},
      {...structuredClone(s0), blocks: s0.blocks.slice(2)}];
    const d2 = new Document(doc);
    d2.clearHistory();
    tog(d2, C(d2, 0, 0), 'number');
    tog(d2, C(d2, 2, 0), 'number');
    assert.notEqual(numPr(d2, 2).numId, numPr(d2, 0).numId);
  });

  it('a selected item of the right list is extended', () => {
    const d = mk(['a', 'b', 'c']);
    tog(d, C(d, 1, 0), 'bullet', 'square');
    tog(d, SEL(d, 0, 0, 2, 1), 'bullet', 'square');
    assert.deepEqual(numIds(d), [1, 1, 1]);
    assert.equal(d.doc.numbering.nums.size, 1);
  });
});

describe('ListMake.toggleList: off and switched', () => {
  it('off: numPr removed, List Paragraph back to the default', () => {
    const d = mk(['a', 'b', ['c', {pStyle: 'Title'}]]);
    tog(d, all(d), 'bullet');
    assert.deepEqual(blocks(d).map((b) => b.pStyle ?? null),
      ['ListParagraph', 'ListParagraph', 'Title']);
    tog(d, all(d), 'bullet');
    assert.deepEqual(shown(d), [null, null, null]);
    assert.deepEqual(blocks(d).map((b) => b.pPr.numPr), [undefined,
      undefined, undefined]);
    assert.deepEqual(blocks(d).map((b) => b.pStyle ?? null),
      [null, null, 'Title']);
  });

  it('a mixed selection (some not in a list) turns it on', () => {
    const d = mk(['a', 'b']);
    tog(d, C(d, 0, 0), 'bullet');
    tog(d, SEL(d, 0, 0, 1, 1), 'bullet');
    assert.deepEqual(numIds(d), [1, 1]);
  });

  it('an entry that is not the list\'s switches instead of off', () => {
    const d = mk(['a']);
    tog(d, C(d, 0, 0), 'number', '1.');
    tog(d, C(d, 0, 0), 'number', '1)');
    assert.deepEqual(shown(d), ['1)']);
    tog(d, C(d, 0, 0), 'number', '1)');
    assert.deepEqual(shown(d), [null]);
  });

  it('bullets <-> numbers keeps every level', () => {
    const d = mk(['a', 'b', 'c']);
    tog(d, all(d), 'bullet');
    step(d, () => setList(d, T(d), C(d, 1, 0), {by: 1}));
    step(d, () => setList(d, T(d), C(d, 2, 0), {level: 2}));
    assert.deepEqual(shown(d), ['\u2022', '\u25E6', '\u25AA']);
    tog(d, all(d), 'number');
    assert.deepEqual(shown(d), ['1.', 'a.', 'i.']);
    assert.deepEqual(blocks(d).map((b) => b.pPr.numPr.ilvl), [0, 1, 2]);
    tog(d, all(d), 'bullet');
    assert.deepEqual(shown(d), ['\u2022', '\u25E6', '\u25AA']);
  });

  it('a style-numbered heading: direct numPr; off writes numId 0',
    async () => {
      const d = await fromFile(await listDocx([heading('One'),
        heading('Two', 2), p(r('x'))]));
      assert.deepEqual(shown(d), ['1', '1.1', null]);
      assert.equal(listKindOf(d.doc, P(d, 0)), 'number');
      tog(d, SEL(d, 0, 0, 1, 1), 'bullet');
      assert.equal(numPr(d, 0).ilvl, 0);
      assert.equal(numPr(d, 1).ilvl, 1, 'the level kept');
      assert.notEqual(numPr(d, 0).numId, 5);
      assert.deepEqual(blocks(d).map((b) => b.pStyle),
        ['Heading1', 'Heading2', undefined], 'heading styles kept');
      tog(d, SEL(d, 0, 0, 1, 1), 'bullet');
      assert.deepEqual(numPr(d, 0), {numId: 0});
      assert.deepEqual(shown(d), [null, null, null]);
      // a heading numbered by its style turned off: numId 0 too
      const d2 = await fromFile(await listDocx([heading('One')]));
      tog(d2, C(d2, 0, 0), 'number');
      assert.deepEqual(numPr(d2, 0), {numId: 0});
      assert.equal(P(d2, 0).pStyle, 'Heading1');
    });

  it('kept blocks (tables) in the selection are skipped', () => {
    const d = mk(['a', box(), 'b']);
    const tbl = P(d, 1);
    tog(d, all(d), 'number');
    assert.equal(P(d, 1), tbl);
    assert.deepEqual(shown(d), ['1.', '#', '2.']);
  });

  it('nothing to format: no undo step, nothing changed', () => {
    const d = mk([box()]);
    step(d, () => toggleList(d, T(d), C(d, 0, 0), {kind: 'bullet'}),
      {none: true});
  });
});

describe('ListMake: styles and numbering parts', () => {
  it('List Paragraph added when the document lacks it', async () => {
    const st = stylesXml('<w:style w:type="paragraph" w:default="1" ' +
      'w:styleId="Normal"><w:name w:val="Normal"/></w:style>');
    const d = await fromFile(await buildDocx({
      'word/document.xml': documentXml(p(r('a')) + p(r('b'))),
      'word/styles.xml': st}));
    const styles = d.doc.styles;
    assert.ok(!styles.styles.has('ListParagraph'));
    tog(d, all(d), 'bullet');
    assert.notEqual(d.doc.styles, styles);
    assert.ok(!styles.styles.has('ListParagraph'), 'old table kept');
    const lp = d.doc.styles.styles.get('ListParagraph');
    assert.equal(lp.name, 'List Paragraph');
    assert.deepEqual(lp.pPr.ind, {left: 720});
    assert.equal(P(d, 0).pStyle, 'ListParagraph');
    const back = await readDocx(await write(d.doc));
    assert.equal(back.styles.styles.get('ListParagraph').name,
      'List Paragraph');
  });

  it('a List Paragraph style under another id is used', async () => {
    const st = stylesXml('<w:style w:type="paragraph" w:default="1" ' +
      'w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Lijstalinea"><w:name ' +
      'w:val="List Paragraph"/></w:style>');
    const d = await fromFile(await buildDocx({
      'word/document.xml': documentXml(p(r('a'))),
      'word/styles.xml': st}));
    const styles = d.doc.styles;
    tog(d, C(d, 0, 0), 'bullet');
    assert.equal(d.doc.styles, styles);
    assert.equal(P(d, 0).pStyle, 'Lijstalinea');
  });

  it('a Word numbering part is extended, old children kept', async () => {
    const d = await fromFile(await listDocx([item('a', 2), p(r('b'))]));
    const old = d.doc.numbering.raw.children.slice();
    tog(d, C(d, 1, 0), 'bullet');
    const now = d.doc.numbering.raw.children;
    assert.deepEqual(now.filter((c) => old.includes(c)), old);
    assert.equal(numPr(d, 1).numId, 8);
    assert.equal(d.doc.meta.numberingPart, 'word/numbering.xml');
  });

  it('numIds that paragraphs use without a definition are avoided',
    () => {
      const d = mk([['x', {pPr: {numPr: {numId: 1, ilvl: 0}}}], 'a']);
      tog(d, C(d, 1, 0), 'number');
      assert.equal(numPr(d, 1).numId, 2);
      assert.deepEqual(shown(d), [null, '1.']);
      // in a kept block (a table cell's paragraph) and in a style
      const n = (name, attrs, ...children) => ({name, attrs, children});
      const tbl = {type: 'opaque', node: n('w:tbl', [], n('w:tr', [],
        n('w:tc', [], n('w:p', [], n('w:pPr', [], n('w:numPr', [],
          n('w:numId', [['w:val', '4']])))))))};
      const d2 = mk([tbl, 'a']);
      tog(d2, C(d2, 1, 0), 'number');
      assert.equal(numPr(d2, 1).numId, 5);
      const d3 = mk(['a']);
      d3.doc.styles.styles.get('Title').pPr.numPr = {numId: 6};
      tog(d3, C(d3, 0, 0), 'number');
      assert.equal(numPr(d3, 0).numId, 7);
    });

  it('a Strict document gets Strict names', async () => {
    const d = await fromFile(await strictDocx());
    tog(d, C(d, 1, 0), 'number');
    const bytes = await write(d.doc);
    const xml = await entryText(bytes, 'word/numbering.xml');
    assert.match(xml, /w:start="720"/);
    assert.doesNotMatch(xml, /w:left=/);
    const back = new Document(await readDocx(bytes));
    assert.deepEqual(shown(back), shown(d));
  });
  it('Strict: the List Paragraph style it adds says w:start', async () => {
    const d = await fromFile(await strictDocx());
    tog(d, C(d, 1, 0), 'bullet');
    const bytes = await write(d.doc);
    const xml = await entryText(bytes, 'word/styles.xml');
    const at = xml.indexOf('w:styleId="ListParagraph"');
    assert.ok(at > 0);
    const lp = xml.slice(at, xml.indexOf('</w:style>', at));
    assert.match(lp, /<w:ind w:start="720"\/>/);
    assert.doesNotMatch(lp, /w:left=/);
    // read back: the same indent, as the field
    const back = await readDocx(bytes);
    assert.deepEqual(back.styles.styles.get('ListParagraph').pPr.ind,
      {left: 720});
  });
});

describe('ListMake: the List Paragraph style it adds', () => {
  it('is based on the document\'s default paragraph style', async () => {
    const d = await fromFile(await buildDocx({
      'word/document.xml': documentXml(p(r('a')) + p(r('b'))),
      'word/styles.xml': stylesXml('<w:style w:type="paragraph" ' +
        'w:default="1" w:styleId="Standard"><w:name w:val="Normal"/>' +
        '</w:style>')}));
    assert.equal(d.doc.styles.defaults.paragraph, 'Standard');
    assert.equal(d.doc.styles.styles.has('Normal'), false);
    tog(d, C(d, 0, 0), 'bullet');
    const lp = d.doc.styles.styles.get('ListParagraph');
    assert.equal(lp.basedOn, 'Standard');
    const xml = await entryText(await write(d.doc), 'word/styles.xml');
    assert.match(xml, /w:styleId="ListParagraph">.*?<w:basedOn w:val="Standard"\/>/);
    // no default paragraph style: based on nothing
    const n = mk(['a']);
    const st = n.doc.styles;
    n.doc.styles = {...st, defaults: {...st.defaults, paragraph: null},
      styles: new Map([...st.styles].filter(([k]) =>
        k !== 'ListParagraph'))};
    tog(n, C(n, 0, 0), 'bullet');
    assert.equal(n.doc.styles.styles.get('ListParagraph').basedOn,
      undefined);
  });
});

describe('ListMake.toggleList: an unused equal list is reused', () => {
  const sizes = (d) => [d.doc.numbering.nums.size,
    d.doc.numbering.raw.children.length];
  it('Bullets off and on five times: no new definitions', () => {
    for (const kind of ['bullet', 'number']) {
      const d = mk(['a', 'b', 'c']);
      tog(d, C(d, 1, 0), kind);
      const first = sizes(d);
      const id = numPr(d, 1).numId;
      for (let k = 0; k < 5; k++) {
        tog(d, C(d, 1, 0), kind);
        assert.equal(numPr(d, 1), undefined);
        tog(d, C(d, 1, 0), kind);
        assert.equal(numPr(d, 1).numId, id);
      }
      assert.deepEqual(sizes(d), first, kind);
    }
  });
  it('another entry, or a num still named somewhere: a new list',
    async () => {
      const d = mk(['a', 'b', 'c']);
      tog(d, C(d, 1, 0), 'bullet');
      tog(d, C(d, 1, 0), 'bullet');
      // another gallery entry: its own definition
      tog(d, C(d, 1, 0), 'bullet', 'square');
      assert.notEqual(numPr(d, 1).numId, 1);
      tog(d, C(d, 1, 0), 'bullet', 'square');
      // num 1 named by a header: never reused
      d.doc.parts.set('word/header1.xml', new TextEncoder().encode(
        '<w:hdr><w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr>' +
        '</w:pPr></w:p></w:hdr>'));
      tog(d, C(d, 1, 0), 'bullet');
      assert.ok(![1, 2].includes(numPr(d, 1).numId));
    });
  it('not a num whose abstract another list in use counts on', () => {
    const d = mk(['a', 'b', 'c']);
    tog(d, all(d), 'number');
    step(d, () => restart(d, T(d), C(d, 1, 0)));
    assert.deepEqual(numIds(d), [1, 2, 2]);
    tog(d, C(d, 0, 0), 'number');
    assert.equal(numPr(d, 0), undefined);
    // num 1 is unused now but shares its abstract with num 2
    tog(d, C(d, 0, 0), 'number');
    assert.ok(![1, 2].includes(numPr(d, 0).numId));
  });
});

describe('ListMake: Restart, Start at, Continue', () => {
  const five = () => {
    const d = mk(['a', 'b', 'c', 'd', 'e']);
    tog(d, all(d), 'number');
    return d;
  };
  it('Restart at 1: this item and every later one of its list', () => {
    const d = five();
    step(d, () => restart(d, T(d), C(d, 2, 1)));
    assert.deepEqual(shown(d), ['1.', '2.', '1.', '2.', '3.']);
    assert.deepEqual(numIds(d), [1, 1, 2, 2, 2]);
    const num = d.doc.numbering.nums.get(2);
    assert.equal(num.abstractNumId, d.doc.numbering.nums.get(1)
      .abstractNumId);
    assert.deepEqual([...num.overrides], [[0, {start: 1}]]);
  });
  it('Start at 5; a deeper level restarts on its own level', () => {
    const d = five();
    step(d, () => restart(d, T(d), C(d, 2, 0), 5));
    assert.deepEqual(shown(d), ['1.', '2.', '5.', '6.', '7.']);
    step(d, () => setList(d, T(d), SEL(d, 3, 0, 4, 1), {by: 1}));
    assert.deepEqual(shown(d), ['1.', '2.', '5.', 'a.', 'b.']);
    step(d, () => restart(d, T(d), C(d, 4, 0), 4));
    assert.deepEqual(shown(d), ['1.', '2.', '5.', 'a.', 'd.']);
    // only the restarted level's startOverride: a sublevel's
    // restart never restarts its parent level
    assert.deepEqual([...d.doc.numbering.nums.get(3).overrides],
      [[1, {start: 4}]]);
  });
  it('Start at 5, then a sublevel restarted: the next top item is 6',
    () => {
      const d = mk(['a', 'b', 'c', 'd', 'e', 'f']);
      tog(d, all(d), 'number');
      step(d, () => restart(d, T(d), C(d, 1, 0), 5));
      step(d, () => setList(d, T(d), SEL(d, 2, 0, 4, 1), {by: 1}));
      assert.deepEqual(shown(d), ['1.', '5.', 'a.', 'b.', 'c.', '6.']);
      step(d, () => restart(d, T(d), C(d, 3, 0)));
      assert.deepEqual(shown(d), ['1.', '5.', 'a.', 'a.', 'b.', '6.']);
      assert.deepEqual(numIds(d), [1, 2, 2, 3, 3, 3]);
    });
  it('Continue joins the previous list of its kind', () => {
    const d = five();
    step(d, () => restart(d, T(d), C(d, 2, 0)));
    assert.deepEqual(shown(d), ['1.', '2.', '1.', '2.', '3.']);
    // from a later item: the whole run of its list joins
    step(d, () => continueList(d, T(d), C(d, 3, 0)));
    assert.deepEqual(shown(d), ['1.', '2.', '3.', '4.', '5.']);
    assert.deepEqual(numIds(d), [1, 1, 1, 1, 1]);
    d.undo();
    step(d, () => continueList(d, T(d), C(d, 4, 0)));
    assert.deepEqual(numIds(d), [1, 1, 1, 1, 1]);
  });
  it('Continue: the run ends at another list of the paragraphs', () => {
    const d = mk(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    tog(d, all(d), 'number');
    step(d, () => restart(d, T(d), C(d, 2, 0)));
    step(d, () => restart(d, T(d), C(d, 5, 0)));
    assert.deepEqual(shown(d), ['1.', '2.', '1.', '2.', '3.', '1.',
      '2.']);
    step(d, () => continueList(d, T(d), C(d, 3, 0)));
    assert.deepEqual(numIds(d), [1, 1, 1, 1, 1, 3, 3]);
    assert.deepEqual(shown(d), ['1.', '2.', '3.', '4.', '5.', '1.',
      '2.']);
  });
  it('Continue across a gap and over a list of another kind', () => {
    const d = mk(['a', 'b', 'gap', 'x', 'c', 'd']);
    tog(d, SEL(d, 0, 0, 1, 1), 'number');
    tog(d, C(d, 3, 0), 'bullet');
    tog(d, SEL(d, 4, 0, 5, 1), 'number');
    assert.deepEqual(shown(d), ['1.', '2.', null, '\u2022', '1.', '2.']);
    step(d, () => continueList(d, T(d), C(d, 4, 0)));
    assert.deepEqual(shown(d), ['1.', '2.', null, '\u2022', '3.', '4.']);
    assert.deepEqual(numIds(d), [1, 1, null, 2, 1, 1]);
  });
  it('two separate lists continuing (G4: one count per abstract)',
    () => {
      // owner's ruling: numbering after a gap continues; Restart
      // makes a second w:num on the same abstract, whose items
      // share the count but restart once at the override
      const d = mk(['a', 'b', 'gap', 'c', 'd', 'gap', 'e']);
      tog(d, SEL(d, 0, 0, 1, 1), 'number');
      tog(d, SEL(d, 3, 0, 4, 1), 'number');
      assert.deepEqual(shown(d), ['1.', '2.', null, '3.', '4.', null,
        null]);
      step(d, () => restart(d, T(d), C(d, 3, 0)));
      assert.deepEqual(shown(d), ['1.', '2.', null, '1.', '2.', null,
        null]);
      // numbering after the restarted list continues it
      tog(d, C(d, 6, 0), 'number');
      assert.deepEqual(shown(d), ['1.', '2.', null, '1.', '2.', null,
        '3.']);
      assert.deepEqual(numIds(d), [1, 1, null, 2, 2, null, 2]);
      step(d, () => continueList(d, T(d), C(d, 3, 0)));
      assert.deepEqual(shown(d), ['1.', '2.', null, '3.', '4.', null,
        '5.']);
    });
  it('nothing to do: no undo step', () => {
    const d = mk(['a', 'b']);
    step(d, () => restart(d, T(d), C(d, 0, 0)), {none: true});
    step(d, () => continueList(d, T(d), C(d, 0, 0)), {none: true});
    tog(d, C(d, 0, 0), 'number');
    tog(d, C(d, 1, 0), 'bullet');
    // the first list: nothing before it
    step(d, () => continueList(d, T(d), C(d, 0, 0)), {none: true});
    // another kind before: nothing of its kind
    step(d, () => continueList(d, T(d), C(d, 1, 0)), {none: true});
  });
  it('a restart that changes no label: no step, no new num', () => {
    const d = five();
    const nums = d.doc.numbering.nums.size;
    const kids = d.doc.numbering.raw.children.length;
    for (let k = 0; k < 5; k++) {
      step(d, () => restart(d, T(d), C(d, 0, 0)), {none: true});
    }
    // Start at the value it shows already
    step(d, () => restart(d, T(d), C(d, 2, 0), 3), {none: true});
    assert.equal(d.doc.numbering.nums.size, nums);
    assert.equal(d.doc.numbering.raw.children.length, kids);
    // a real restart, pressed five times: one step, one new num
    const n = d.undoDepth;
    for (let k = 0; k < 5; k++) {
      step(d, () => restart(d, T(d), C(d, 2, 0)), {maybe: true});
    }
    assert.equal(d.undoDepth, n + 1);
    assert.equal(d.doc.numbering.nums.size, nums + 1);
    assert.deepEqual(shown(d), ['1.', '2.', '1.', '2.', '3.']);
  });
  it('bad arguments: RangeError first, nothing changed', () => {
    const d = five();
    const before = state(d);
    const n = d.undoDepth;
    for (const s of [-1, 1.5, 2 ** 31, NaN, '3', null]) {
      assert.throws(() => restart(d, T(d), C(d, 1, 0), s), RangeError,
        String(s));
    }
    for (const a of [null, {}, {kind: 'x'}, {kind: 'bullet', entry:
      '1.'}, {kind: 'number', entry: 'disc'}, {kind: 'bullet',
      entry: 'nope'}, {kind: 'bullet', more: 1}, 'bullet']) {
      assert.throws(() => toggleList(d, T(d), C(d, 1, 0), a),
        RangeError, JSON.stringify(a));
    }
    assert.deepStrictEqual(state(d), before);
    assert.equal(d.undoDepth, n);
  });
});

describe('ListMake: the kind of a list is its level 0', () => {
  // a numbered list whose level 1 is bullets
  const MIXED = numberingXml('<w:abstractNum w:abstractNumId="0">' +
    lvl(0) + lvl(1, {fmt: 'bullet', text: '\uF0B7', font: 'Symbol'}) +
    '</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/>' +
    '</w:num>');
  const mixed = async () => fromFile(await listDocx([item('one', 1),
    item('sub', 1, 1), item('two', 1), p(r('plain')), p(r('b'))],
  {numbering: MIXED}));
  it('a bullet sublevel of a numbered list is in a numbered list',
    async () => {
      const d = await mixed();
      assert.deepEqual(shown(d), ['1.', '\u2022', '2.', null, null]);
      assert.equal(listKindOf(d.doc, P(d, 1)), 'number');
      assert.deepEqual(query(d.doc, C(d, 1, 0)).listKind, 'number');
      assert.equal(listEntryOf(d.doc, P(d, 1)), '1.');
    });
  it('Numbering on it: out of the list (the button was on)',
    async () => {
      const d = await mixed();
      tog(d, C(d, 1, 0), 'number');
      assert.equal(numPr(d, 1), undefined);
      assert.equal(P(d, 1).pStyle, undefined);
      assert.deepEqual(shown(d), ['1.', null, '2.', null, null]);
    });
  it('Bullets on it: a bullet list of its own, at its level',
    async () => {
      const d = await mixed();
      tog(d, C(d, 1, 0), 'bullet');
      // (numId 5 is named by the heading styles)
      assert.deepEqual(numPr(d, 1), {numId: 6, ilvl: 1});
      assert.deepEqual(shown(d), ['1.', '\u25E6', '2.', null, null]);
      assert.equal(listKindOf(d.doc, P(d, 1)), 'bullet');
    });
  it('Continue on a bullet list skips the numbered one', async () => {
    const d = await mixed();
    tog(d, C(d, 4, 0), 'bullet');
    step(d, () => continueList(d, T(d), C(d, 4, 0)), {none: true});
  });
});

describe('ListMake: numIds used outside the body', () => {
  const FTR = 'word/footer1.xml';
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/' +
    'main';
  const numP = (id) => '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/>' +
    `<w:numId w:val="${id}"/></w:numPr></w:pPr></w:p>`;
  it('a dangling numId used only in a footer part', async () => {
    const d = await fromFile(await buildDocx({
      'word/document.xml': documentXml(p(r('a'))),
      [FTR]: `<?xml version="1.0"?><w:ftr xmlns:w="${W}">${numP(9)}` +
        '</w:ftr>'}));
    assert.ok(d.doc.parts.has(FTR));
    tog(d, C(d, 0, 0), 'number');
    assert.equal(numPr(d, 0).numId, 10);
  });
  it('a numId in a text box (an inline kept raw)', async () => {
    const box = '<w:r><w:pict><v:shape xmlns:v="urn:schemas-microsoft-' +
      'com:vml"><v:textbox><w:txbxContent>' + numP(12) +
      '</w:txbxContent></v:textbox></v:shape></w:pict></w:r>';
    const d = await fromFile(await buildDocx({
      'word/document.xml': documentXml(p(r('a') + box))}));
    assert.ok(Object.values(P(d, 0).inlines).some((x) => x.node));
    tog(d, C(d, 0, 0), 'number');
    assert.equal(numPr(d, 0).numId, 13);
  });
  it('a numId in a tracked change\'s old pPr, or in a run\'s raw rPr',
    async () => {
      const chg = '<w:pPrChange w:id="1" w:author="A" ' +
        'w:date="2024-01-01T00:00:00Z"><w:pPr><w:numPr><w:ilvl ' +
        'w:val="0"/><w:numId w:val="21"/></w:numPr></w:pPr>' +
        '</w:pPrChange>';
      const rch = '<w:rPrChange w:id="2" w:author="A" ' +
        'w:date="2024-01-01T00:00:00Z"><w:rPr><w:numId w:val="31"/>' +
        '</w:rPr></w:rPrChange>';
      const d = await fromFile(await buildDocx({
        'word/document.xml': documentXml(p(r('a', rch), chg))}));
      assert.ok(P(d, 0).pPr.extra.length);
      assert.ok(P(d, 0).runs[0].rPr.extra.length);
      tog(d, C(d, 0, 0), 'number');
      assert.equal(numPr(d, 0).numId, 32);
    });
});

describe('FormatApply ids and Format.query', () => {
  it('bullets, numbering, listRestart, listContinue', () => {
    for (const id of ['bullets', 'numbering', 'listRestart',
      'listContinue']) assert.ok(isFormat(id), id);
    const d = mk(['a', 'b', 'c']);
    const t = T(d);
    apply('numbering', d, t, all(d));
    assert.deepEqual(shown(d), ['1.', '2.', '3.']);
    apply('listRestart', d, t, C(d, 1, 0), 4);
    assert.deepEqual(shown(d), ['1.', '4.', '5.']);
    apply('listContinue', d, t, C(d, 1, 0));
    assert.deepEqual(shown(d), ['1.', '2.', '3.']);
    apply('listRestart', d, t, C(d, 2, 0));
    assert.deepEqual(shown(d), ['1.', '2.', '1.']);
    apply('numbering', d, t, C(d, 0, 0), 'I.');
    // (the second item is now the first of its numId's count)
    assert.deepEqual(shown(d), ['I.', '1.', '1.']);
    apply('bullets', d, t, all(d), 'arrow');
    assert.equal(listEntryOf(d.doc, P(d, 2)), 'arrow');
    apply('bullets', d, t, all(d), null);
    assert.deepEqual(shown(d), [null, null, null], 'all bullets: off');
    apply('bullets', d, t, all(d));
    assert.deepEqual(shown(d), ['\u2022', '\u2022', '\u2022']);
    assert.throws(() => apply('bullets', d, t, all(d), '1.'),
      RangeError);
    assert.throws(() => apply('numbering', d, t, all(d), 7),
      RangeError);
    assert.throws(() => apply('listRestart', d, t, all(d), -2),
      RangeError);
  });
  it('query: listKind and listEntry, null when mixed or none', () => {
    const d = mk(['a', 'b', 'c']);
    const q = (sel) => {
      const x = query(d.doc, sel);
      return [x.listKind, x.listEntry];
    };
    assert.deepEqual(q(all(d)), [null, null]);
    tog(d, SEL(d, 0, 0, 1, 1), 'bullet', 'square');
    assert.deepEqual(q(C(d, 0, 0)), ['bullet', 'square']);
    assert.deepEqual(q(SEL(d, 0, 0, 1, 1)), ['bullet', 'square']);
    assert.deepEqual(q(all(d)), [null, null]);
    tog(d, C(d, 2, 0), 'bullet', 'disc');
    assert.deepEqual(q(all(d)), ['bullet', null]);
    tog(d, C(d, 2, 0), 'number', 'A.');
    assert.deepEqual(q(C(d, 2, 0)), ['number', 'A.']);
    assert.deepEqual(q(all(d)), [null, null]);
  });
  it('a list no gallery entry matches: its kind, entry null',
    async () => {
      const d = await fromFile(await listDocx([item('a', 4)]));
      assert.deepEqual([listKindOf(d.doc, P(d, 0)),
        listEntryOf(d.doc, P(d, 0))], ['number', null]);
      assert.equal(listKindOf(d.doc, P(d, 0)), 'number');
      const d2 = mk(['plain']);
      assert.equal(listKindOf(d2.doc, P(d2, 0)), null);
      assert.equal(listEntryOf(d2.doc, P(d2, 0)), null);
    });
});

// Hostile numbering parts (the review focus): every command either
// works (old children kept, undo exact) or throws a RangeError and
// leaves the document as it was.
const NUMS = (inner) => numberingXml(inner);
const ABS = (id, inner = lvl(0) + lvl(1)) =>
  `<w:abstractNum w:abstractNumId="${id}">${inner}</w:abstractNum>`;
const NUM = (id, a) => `<w:num w:numId="${id}"><w:abstractNumId ` +
  `w:val="${a}"/></w:num>`;
const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-' +
  'compatibility/2006"';
const HOSTILE = [
  ['a num naming a missing abstract', NUMS(ABS(0) + NUM(1, 9) +
    NUM(2, 0))],
  ['string ids', NUMS(ABS('x') + ABS(0) + NUM('x', 'x') + NUM(1, 0) +
    NUM(2, 0))],
  ['numId at 2^31 - 1', NUMS(ABS(0) + NUM(1, 0) + NUM(2, 0) +
    NUM(2147483647, 0))],
  ['abstract id at 2^31 - 1', NUMS(ABS(2147483647) + NUM(1,
    2147483647) + NUM(2, 2147483647))],
  ['ids past 2^31', NUMS(ABS(0) + NUM(1, 0) + NUM(2, 0) +
    NUM(4294967296, 0))],
  ['duplicated ids', NUMS(ABS(0) + ABS(0, lvl(0, {fmt: 'bullet',
    text: 'o'})) + NUM(1, 0) + NUM(1, 0) + NUM(2, 0))],
  ['mc:AlternateContent, numPicBullet, numIdMacAtCleanup',
    numberingXml(`<mc:AlternateContent ${MC}><mc:Choice ` +
      'Requires="w14"><w:numPicBullet w:numPicBulletId="0"/>' +
      '</mc:Choice><mc:Fallback><w:numPicBullet w:numPicBulletId=' +
      '"0"/></mc:Fallback></mc:AlternateContent>' + ABS(0) +
      NUM(1, 0) + NUM(2, 0) +
      '<w:numIdMacAtCleanup w:val="2"/>')],
  ['an empty part', NUMS('')],
];
const HOSTILE_DOC = (numbering, rels) => buildDocx({
  'word/document.xml': documentXml(item('a', 1) + p(r('b')) +
    item('c', 2, 1) + item('d', 2) + p(r('e'))),
  'word/styles.xml': STYLES_LIST, 'word/numbering.xml': numbering,
  ...(rels ? {'word/_rels/document.xml.rels': rels} : {})});
const COMMANDS = [
  ['bullets on all', (d) => toggleList(d, T(d), all(d),
    {kind: 'bullet'})],
  ['numbering on b', (d) => toggleList(d, T(d), C(d, 1, 0),
    {kind: 'number', entry: 'i.'})],
  ['bullets on a', (d) => toggleList(d, T(d), C(d, 0, 0),
    {kind: 'bullet', entry: 'disc'})],
  ['restart c', (d) => restart(d, T(d), C(d, 2, 0), 3)],
  ['continue d', (d) => continueList(d, T(d), C(d, 3, 0))],
  ['numbering on e', (d) => toggleList(d, T(d), C(d, 4, 0),
    {kind: 'number'})],
];

describe('ListMake: hostile numbering parts', () => {
  const cases = HOSTILE.map(([n, x]) => [n, () => HOSTILE_DOC(x)])
    .concat([['a numbering part without a relationship', () =>
      HOSTILE_DOC(NUMS(ABS(0) + NUM(1, 0) + NUM(2, 0)),
        relsXml([['rIdS1', REL('styles'), 'styles.xml']]))]]);
  for (const [name, bytes] of cases) {
    it(name, async () => {
      const src = await bytes();
      let refused = 0;
      for (const [what, cmd] of COMMANDS) {
        const d = await fromFile(src);
        const before = state(d);
        const raw = d.doc.numbering && d.doc.numbering.raw;
        const old = raw ? raw.children.slice() : [];
        try {
          step(d, () => cmd(d), {maybe: true});
        } catch (e) {
          if (e instanceof assert.AssertionError) throw e;
          assert.ok(e instanceof RangeError, what + ': ' + e);
          assert.deepStrictEqual(state(d), before, what + ' unchanged');
          refused++;
          continue;
        }
        if (d.undoDepth && d.doc.numbering && raw) {
          const now = d.doc.numbering.raw.children;
          assert.deepEqual(now.filter((c) => old.includes(c)), old,
            what + ': old children kept in order');
        }
        // the result is written and read back with the same labels
        const back = new Document(await readDocx(await write(d.doc)));
        assert.deepEqual(shown(back), shown(d), what + ' read back');
      }
      if (/2\^31|past/.test(name)) assert.ok(refused > 0, name);
    });
  }
});

describe('ListMake: 100,000 paragraphs', () => {
  it('made a list in one step < 3 s, undo < 3 s', () => {
    const n = 100000;
    const d = mk(Array.from({length: n}, (_, i) => 'p' + i));
    const sel = SEL(d, 0, 0, n - 1, 1);
    let t = performance.now();
    toggleList(d, T(d), sel, {kind: 'number'});
    const make = performance.now() - t;
    assert.equal(d.undoDepth, 1);
    assert.equal(labels(d.doc).get(P(d, n - 1).id).text, n + '.');
    t = performance.now();
    d.undo();
    const undo = performance.now() - t;
    assert.equal(d.doc.numbering, null);
    assert.ok(make < 3000, 'make ' + make);
    assert.ok(undo < 3000, 'undo ' + undo);
    t = performance.now();
    restart(d, T(d), C(d, 0, 0), 1);
    toggleList(d, T(d), sel, {kind: 'bullet'});
    restart(d, T(d), C(d, 10, 0), 1);
    continueList(d, T(d), C(d, 10, 0));
    const more = performance.now() - t;
    assert.ok(more < 6000, 'restart, bullets, continue ' + more);
  });
});
