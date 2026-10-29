// Footnotes made endnotes and back, and custom marks (Batch E2):
// NoteCmd convertNote (this note, all footnotes, all endnotes, swap:
// the notes move between the maps under new ids, the marks and the
// note styles follow, one undo step) and customMark (the text a
// mark shows instead of a number, in the text and in the note).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {numbers, noteState, labelFor}
  from '../../tools/moreapps/!Letters/NoteNumbers';
import {insertNote, convertNote, convertWhy, convertPlan, customMark,
  customWhy, noteNear, MARK_MAX}
  from '../../tools/moreapps/!Letters/NoteCmd';
import {customOf, customForInsert}
  from '../../tools/moreapps/!Letters/NoteCustom';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {checkNotes, checkBlock}
  from '../../tools/moreapps/!Letters/ModelCheck';
import {scan} from '../../tools/moreapps/!Letters/Walk';
import {p, r} from './build-docx.mjs';
import {noteDoc, noteP, mark, emark, enoteP} from './note-fixtures.mjs';
import {lintAfter} from './lint-after.mjs';

const F = 'footnote', E = 'endnote';
const DATE = new Date(2024, 4, 6, 7, 8, 10);
const save = (doc) => writeDocx(doc, {date: DATE});
const dec = (b) => new TextDecoder().decode(b);
const fmap = (d) => d.doc.notes.footnotes;
const emap = (d) => d.doc.notes.endnotes;
const para = (d, i = 0) => d.doc.sections[0].blocks[i];
const at = (b, off) => ({id: b.id, off});
const nums = (d, kind) => Object.fromEntries(numbers(d.doc)[kind]);
const normal = (m) => [...m.values()].filter((n) => n.type === 'normal');
const ids = (m) => normal(m).map((n) => n.id);
const text = (n) => n.blocks.map((b) => b.text).join('/');

/** The body's marks in order: [kind, id]. */
function bodyMarks(d) {
  const out = [];
  scan(d.doc, (b) => {
    if (b.type !== 'p') return;
    for (let k = 0; k < b.text.length; k++) {
      const x = b.inlines[k];
      if (x && x.kind === 'noteRef' && !x.self) out.push([x.note, x.id]);
    }
  });
  return out;
}

/** The body's mark inlines in order. */
function markXs(d) {
  const out = [];
  scan(d.doc, (b) => {
    if (b.type !== 'p') return;
    for (let k = 0; k < b.text.length; k++) {
      const x = b.inlines[k];
      if (x && x.kind === 'noteRef' && !x.self) out.push(x);
    }
  });
  return out;
}

/** Every mark names a normal note of its kind, and each note has one
 *  mark at least. */
function oneToOne(d) {
  for (const [k, id] of bodyMarks(d)) {
    const n = d.doc.notes[k + 's'].get(id);
    assert.ok(n && n.type === 'normal', k + ' ' + id + ' is there');
  }
  checkNotes(d.doc.notes);
  scan(d.doc, (b) => { if (b.type === 'p') checkBlock(b); });
}

const setup = async (doc) => {
  const d = new Document(await doc);
  return {d, t: new Typing(d)};
};

/** "a[f1]b[e1]c" / "d[f2]e[e2]" with footnotes 1, 2 and endnotes 1,
 *  2. */
const mixed = () => noteDoc(p(r('a') + mark(1) + r('b') + emark(1) +
  r('c')) + p(r('d') + mark(2) + r('e') + emark(2)),
{1: noteP('f one'), 2: noteP('f two')},
{endnotes: {1: enoteP('e one'), 2: enoteP('e two')}});

/** Footnotes 1, 2, 3 only (no endnotes part). */
const three = () => noteDoc(p(r('a') + mark(1) + r('b') + mark(2)) +
  p(r('c') + mark(3)), {1: noteP('one'), 2: noteP('two'),
  3: noteP('three')});

describe('noteNear', () => {
  it('the mark before the caret, else the one after', async () => {
    const {d} = await setup(mixed());
    const b = para(d);
    assert.deepEqual(noteNear(d.doc, S.caret(at(b, 2))),
      {kind: F, id: 1});
    assert.deepEqual(noteNear(d.doc, S.caret(at(b, 1))),
      {kind: F, id: 1});
    assert.deepEqual(noteNear(d.doc, S.caret(at(b, 4))),
      {kind: E, id: 1});
    assert.equal(noteNear(d.doc, S.caret(at(b, 0))), null);
    assert.deepEqual(noteNear(d.doc, S.select(at(b, 0), at(b, 5))),
      {kind: F, id: 1}, 'a range: its first mark');
    assert.equal(noteNear(d.doc, null), null);
  });
});

describe('convertNote: this note', () => {
  it('a footnote becomes an endnote: new id, mark rewritten, one ' +
    'step; undo gives the very objects back; redo', async () => {
    const {d, t} = await setup(mixed());
    const f1 = fmap(d).get(1), b0 = para(d), b1 = para(d, 1);
    const secs = d.doc.sections, blocks = secs[0].blocks;
    const bytes = await save(d.doc), depth = d.undoDepth;
    const out = convertNote(d, t, S.caret(at(b0, 2)), 'this');
    assert.equal(out.changed, 1);
    assert.deepEqual(out.skipped, []);
    assert.equal(d.undoDepth, depth + 1, 'one step');
    assert.deepEqual(ids(fmap(d)), [2]);
    assert.deepEqual(ids(emap(d)), [1, 2, 3]);
    const n = emap(d).get(3);
    assert.equal(n.kind, E);
    assert.equal(n.type, 'normal');
    assert.equal(text(n), OBJ + ' f one');
    const self = n.blocks[0].inlines[0];
    assert.equal(self.self, true);
    assert.equal(self.note, E);
    assert.equal(self.node.name, 'w:endnoteRef');
    const x = para(d).inlines[1];
    assert.equal(x.note, E);
    assert.equal(x.id, 3);
    assert.equal(x.node.name, 'w:endnoteReference');
    assert.deepEqual(x.node.attrs, [['w:id', '3']]);
    assert.deepEqual(bodyMarks(d), [[E, 3], [E, 1], [F, 2], [E, 2]]);
    assert.deepEqual(nums(d, 'endnotes'), {3: '1', 1: '2', 2: '3'});
    assert.deepEqual(nums(d, 'footnotes'), {2: '1'});
    oneToOne(d);
    d.undo();
    assert.equal(fmap(d).get(1), f1, 'the very note');
    assert.equal(para(d), b0, 'the very paragraph');
    assert.equal(para(d, 1), b1);
    assert.equal(d.doc.sections, secs);
    assert.equal(d.doc.sections[0].blocks, blocks);
    assert.deepEqual(ids(emap(d)), [1, 2]);
    assert.deepEqual(await save(d.doc), bytes, 'bytes as before');
    d.redo();
    assert.deepEqual(bodyMarks(d), [[E, 3], [E, 1], [F, 2], [E, 2]]);
    assert.equal(text(emap(d).get(3)), OBJ + ' f one');
    oneToOne(d);
  });

  it('an endnote becomes a footnote', async () => {
    const {d, t} = await setup(mixed());
    const out = convertNote(d, t, S.caret(at(para(d), 4)), 'this');
    assert.equal(out.changed, 1);
    assert.deepEqual(bodyMarks(d), [[F, 1], [F, 3], [F, 2], [E, 2]]);
    assert.equal(text(fmap(d).get(3)), OBJ + ' e one');
    assert.equal(fmap(d).get(3).blocks[0].inlines[0].node.name,
      'w:footnoteRef');
    assert.deepEqual(nums(d, 'footnotes'), {1: '1', 3: '2', 2: '3'});
    oneToOne(d);
  });

  it('in the notes mode: the note being edited', async () => {
    const {d} = await setup(mixed());
    const fd = facadeOf(d, {note: {kind: F, id: 2}});
    const out = convertNote(fd, null, null, 'this');
    assert.equal(out.changed, 1);
    assert.deepEqual(ids(fmap(d)), [1]);
    assert.equal(text(emap(d).get(3)), OBJ + ' f two');
    assert.equal(fd.gone, true);
  });

  it('refused: no mark by the caret, a broken mark, a header',
    async () => {
      const {d, t} = await setup(noteDoc(p(r('ab') + mark(7) +
        mark(1)), {1: noteP('one')}));
      const depth = d.undoDepth;
      let out = convertNote(d, t, S.caret(at(para(d), 1)), 'this');
      assert.equal(out.changed, 0);
      assert.match(out.error, /mark/);
      out = convertNote(d, t, S.caret(at(para(d), 3)), 'this');
      assert.match(out.error, /not there/);
      assert.equal(d.undoDepth, depth);
      assert.match(convertWhy(d, S.caret(at(para(d), 3)), 'nonsense'),
        /kind of conversion/);
      assert.match(convertWhy(d, null, '__proto__'),
        /kind of conversion/);
    });
});

describe('convertNote: all', () => {
  it('all footnotes to endnotes: ids increase in mark order',
    async () => {
      const {d, t} = await setup(mixed());
      const out = convertNote(d, t, null, 'allFootnotes');
      assert.equal(out.changed, 2);
      assert.deepEqual(ids(fmap(d)), []);
      assert.deepEqual(ids(emap(d)), [1, 2, 3, 4]);
      assert.deepEqual(bodyMarks(d), [[E, 3], [E, 1], [E, 4], [E, 2]]);
      assert.equal(text(emap(d).get(3)), OBJ + ' f one');
      assert.equal(text(emap(d).get(4)), OBJ + ' f two');
      assert.deepEqual(d.doc.notes.order.endnotes, [-1, 0, 1, 2, 3, 4]);
      assert.deepEqual(d.doc.notes.order.footnotes, [-1, 0]);
      assert.deepEqual(nums(d, 'endnotes'), {3: '1', 1: '2', 4: '3',
        2: '4'});
      oneToOne(d);
    });

  it('all endnotes to footnotes', async () => {
    const {d, t} = await setup(mixed());
    convertNote(d, t, null, 'allEndnotes');
    assert.deepEqual(ids(emap(d)), []);
    assert.deepEqual(bodyMarks(d), [[F, 1], [F, 3], [F, 2], [F, 4]]);
    assert.deepEqual(nums(d, 'footnotes'), {1: '1', 3: '2', 2: '3',
      4: '4'});
    oneToOne(d);
  });

  it('swap: footnotes become endnotes and endnotes footnotes, one ' +
    'step; undo; written, read back, lint clean', async () => {
    const {d, t} = await setup(mixed());
    const bytes = await save(d.doc), depth = d.undoDepth;
    const out = convertNote(d, t, null, 'swap');
    assert.equal(out.changed, 4);
    assert.equal(d.undoDepth, depth + 1);
    assert.deepEqual(bodyMarks(d), [[E, 3], [F, 3], [E, 4], [F, 4]]);
    assert.equal(text(emap(d).get(3)), OBJ + ' f one');
    assert.equal(text(fmap(d).get(3)), OBJ + ' e one');
    assert.equal(text(fmap(d).get(4)), OBJ + ' e two');
    oneToOne(d);
    const {zip} = await lintAfter(d.doc, 'swapped notes');
    const doc = dec(zip.get('word/document.xml'));
    assert.match(doc, /<w:endnoteReference w:id="3"\/>/);
    assert.match(doc, /<w:footnoteReference w:id="4"\/>/);
    const en = dec(zip.get('word/endnotes.xml'));
    assert.match(en, /<w:endnote w:id="3"><w:p>(<w:pPr>.*?<\/w:pPr>)?<w:r>(<w:rPr>.*?<\/w:rPr>)?<w:endnoteRef\/>/);
    const back = await readDocx(await save(d.doc));
    const d2 = new Document(back);
    assert.deepEqual(bodyMarks(d2), bodyMarks(d));
    assert.equal(text(back.notes.endnotes.get(4)), OBJ + ' f two');
    assert.equal(text(back.notes.footnotes.get(3)), OBJ + ' e one');
    assert.deepEqual(Object.fromEntries(numbers(back).footnotes),
      nums(d, 'footnotes'));
    d.undo();
    assert.deepEqual(await save(d.doc), bytes);
  });

  it('zero notes: no step', async () => {
    const {d, t} = await setup(three());
    const depth = d.undoDepth;
    const out = convertNote(d, t, null, 'allEndnotes');
    assert.equal(out.changed, 0);
    assert.equal(out.error, undefined);
    assert.equal(d.undoDepth, depth);
    assert.equal(noteState(d.doc, 'endnotes'), 'missing');
  });

  it('the target kind with no part: made in the same step', async () => {
    const {d, t} = await setup(three());
    const out = convertNote(d, t, null, 'allFootnotes');
    assert.equal(out.changed, 3);
    assert.equal(noteState(d.doc, 'endnotes'), 'known');
    assert.deepEqual([...emap(d).keys()], [-1, 0, 1, 2, 3]);
    assert.deepEqual(bodyMarks(d), [[E, 1], [E, 2], [E, 3]]);
    await lintAfter(d.doc, 'endnotes made by a conversion');
    d.undo();
    assert.equal(noteState(d.doc, 'endnotes'), 'missing');
    assert.deepEqual(ids(fmap(d)), [1, 2, 3]);
  });

  it('the target kind kept as bytes: refused, nothing changed',
    async () => {
      const doc = await three();
      // (an endnotes relationship to a part that could not be read)
      doc.rels = [...doc.rels, {id: 'rIdX', type: 'http://schemas.' +
        'openxmlformats.org/officeDocument/2006/relationships/endnotes',
      target: 'endnotes.xml'}];
      const {d, t} = await setup(doc);
      assert.equal(noteState(d.doc, 'endnotes'), 'unknown');
      const depth = d.undoDepth, before = d.doc.notes;
      const out = convertNote(d, t, null, 'allFootnotes');
      assert.equal(out.changed, 0);
      assert.match(out.error, /could not be read/);
      assert.equal(d.undoDepth, depth);
      assert.equal(d.doc.notes, before);
      assert.match(convertNote(d, t, null, 'allEndnotes').error,
        /could not be read/);
    });

  it('styles: Footnote Text and Reference become the endnote ones; ' +
    'other styles kept', async () => {
      const {d, t} = await setup(noteDoc(p(r('ab')), {}));
      insertNote(d, t, S.caret(at(para(d), 1)), F);
      insertNote(d, t, S.caret(at(para(d), 3)), F);
      // (note 2 has a user style on its paragraph)
      const n2 = fmap(d).get(2);
      d.apply({op: 'setProps', block: [0, 0], pStyle: 'Title',
        story: {note: {kind: F, id: 2}}});
      assert.equal(fmap(d).get(2).blocks[0].pStyle, 'Title');
      assert.ok(n2);
      const out = convertNote(d, t, null, 'allFootnotes');
      assert.equal(out.changed, 2);
      const [a, b] = normal(emap(d));
      assert.equal(a.blocks[0].pStyle, 'EndnoteText');
      assert.equal(a.blocks[0].runs[0].rStyle, 'EndnoteReference');
      assert.equal(b.blocks[0].pStyle, 'Title', 'a user style kept');
      assert.equal(b.blocks[0].runs[0].rStyle, 'EndnoteReference');
      for (const k of [1, 3]) {
        const run = para(d).runs.find((u) => u.start === k);
        assert.equal(run.rStyle, 'EndnoteReference', 'mark ' + k);
      }
      for (const s of ['EndnoteText', 'EndnoteReference'])
        assert.ok(d.doc.styles.styles.has(s), s);
      oneToOne(d);
      await lintAfter(d.doc, 'converted with styles');
      d.undo();
      assert.ok(!d.doc.styles.styles.has('EndnoteText'));
      assert.equal(para(d).runs.find((u) => u.start === 1).rStyle,
        'FootnoteReference');
    });

  it('a mark restyled next to a run of the new style: the runs ' +
    'are merged (normalised)', async () => {
      // (found by the corpus burst: a footnote mark right after an
      // endnote mark, both in their reference styles; converting the
      // footnote gave two neighbouring runs in Endnote Reference)
      const {d, t} = await setup(noteDoc(p(r('ab')), {}));
      insertNote(d, t, S.caret(at(para(d), 1)), E);
      insertNote(d, t, S.caret(at(para(d), 2)), F);
      const rs = (b) => b.runs.map((u) => [u.start, u.end, u.rStyle]);
      assert.deepEqual(rs(para(d)), [[0, 1, undefined],
        [1, 2, 'EndnoteReference'], [2, 3, 'FootnoteReference'],
        [3, 4, undefined]]);
      const out = convertNote(d, t, S.caret(at(para(d), 3)), 'this');
      assert.equal(out.changed, 1);
      assert.deepEqual(rs(para(d)), [[0, 1, undefined],
        [1, 3, 'EndnoteReference'], [3, 4, undefined]]);
      checkBlock(para(d));
      oneToOne(d);
      d.undo();
      assert.equal(para(d).runs[2].rStyle, 'FootnoteReference');
      // and in a note: its own mark's run next to one of the style
      const n = fmap(d).get(1);
      d.apply({op: 'replaceText', story: {note: {kind: F, id: 1}},
        block: [0, 0], at: 0, del: 0, ins: 'x',
        rStyle: 'EndnoteReference'});
      assert.notEqual(fmap(d).get(1), n);
      convertNote(d, t, null, 'allFootnotes');
      for (const m of normal(emap(d))) checkBlock(m.blocks[0]);
    });

  describe('marks side by side keep their own reference style',
    () => {
      const REF = {[F]: 'FootnoteReference', [E]: 'EndnoteReference'};
      const rs = (b) => b.runs.map((u) => [u.start, u.end, u.rStyle]);
      /** Each mark of b: [offset, kind, its run's style]. */
      const styled = (b) => markXs({doc: {sections: [{blocks: [b]}]}})
        .map((x) => {
          const k = Object.keys(b.inlines).map(Number)
            .find((o) => b.inlines[o] === x);
          const u = b.runs.find((v) => v.start <= k && k < v.end);
          return [k, x.note, u.rStyle];
        });
      const allOwn = (b) => {
        for (const [k, kind, st] of styled(b))
          assert.equal(st, REF[kind], 'mark at ' + k);
        checkBlock(b);
      };
      /** "ab" with marks of kinds put in after "a", in order. */
      const row = async (kinds) => {
        const {d, t} = await setup(noteDoc(p(r('ab')), {}));
        kinds.forEach((k, i) => insertNote(d, t,
          S.caret(at(para(d), 1 + i)), k));
        allOwn(para(d));
        return {d, t};
      };

      // (found in review: normalising after each mark merged the
      // first switched run into its neighbour, and the next mark's
      // switch took the first mark with it)
      it('an endnote mark then a footnote mark, swapped', async () => {
        const {d, t} = await row([E, F]);
        assert.deepEqual(rs(para(d)).slice(1, 3),
          [[1, 2, 'EndnoteReference'], [2, 3, 'FootnoteReference']]);
        const out = convertNote(d, t, null, 'swap');
        assert.equal(out.changed, 2);
        assert.deepEqual(rs(para(d)).slice(1, 3),
          [[1, 2, 'FootnoteReference'], [2, 3, 'EndnoteReference']]);
        assert.deepEqual(styled(para(d)).map((x) => x[1]), [F, E]);
        allOwn(para(d));
        oneToOne(d);
      });

      it('a footnote mark then an endnote mark, swapped', async () => {
        const {d, t} = await row([F, E]);
        convertNote(d, t, null, 'swap');
        assert.deepEqual(styled(para(d)).map((x) => x[1]), [E, F]);
        allOwn(para(d));
      });

      it('three marks in a row, swapped and swapped back',
        async () => {
          const {d, t} = await row([E, F, E]);
          convertNote(d, t, null, 'swap');
          assert.deepEqual(styled(para(d)).map((x) => x[1]), [F, E, F]);
          allOwn(para(d));
          convertNote(d, t, null, 'swap');
          assert.deepEqual(styled(para(d)).map((x) => x[1]), [E, F, E]);
          allOwn(para(d));
          oneToOne(d);
        });

      it('marks of one kind side by side: one converted, the other ' +
        'keeps its style; all converted: one run', async () => {
          const {d, t} = await row([F, F]);
          // (two marks in one run of the reference style)
          assert.deepEqual(rs(para(d))[1], [1, 3, 'FootnoteReference']);
          convertNote(d, t, S.caret(at(para(d), 2)), 'this');
          allOwn(para(d));
          assert.deepEqual(styled(para(d)).map((x) => x[1]), [E, F]);
          d.undo();
          convertNote(d, t, null, 'allFootnotes');
          assert.deepEqual(rs(para(d))[1], [1, 3, 'EndnoteReference']);
          allOwn(para(d));
        });

      it('a mark next to text in the style it is switched to: merged',
        async () => {
          const {d, t} = await setup(noteDoc(p(r('ab')), {}));
          insertNote(d, t, S.caret(at(para(d), 2)), E);
          insertNote(d, t, S.caret(at(para(d), 1)), F);
          // ("a", "z" in Endnote Reference, the footnote mark, "b")
          d.apply({op: 'replaceText', block: [0, 0], at: 1, del: 0,
            ins: 'z', rStyle: 'EndnoteReference'});
          assert.deepEqual(rs(para(d)).slice(1, 3),
            [[1, 2, 'EndnoteReference'], [2, 3, 'FootnoteReference']]);
          convertNote(d, t, S.caret(at(para(d), 3)), 'this');
          assert.deepEqual(rs(para(d))[1], [1, 3, 'EndnoteReference']);
          allOwn(para(d));
        });
    });

  it('a custom mark is kept', async () => {
    const {d, t} = await setup(noteDoc(p(r('a') + '<w:r>' +
      '<w:footnoteReference w:customMarkFollows="1" w:id="1"/>' +
      '<w:t>*</w:t></w:r>' + mark(2)), {1: p(r('* custom')),
      2: noteP('two')}));
    convertNote(d, t, null, 'allFootnotes');
    const [x1, x2] = markXs(d);
    assert.equal(x1.custom, '*');
    assert.equal(x1.node.name, 'w:endnoteReference');
    assert.deepEqual(x1.node.attrs, [['w:customMarkFollows', '1'],
      ['w:id', '1']]);
    assert.deepEqual(nums(d, 'endnotes'), {2: '1'});
    assert.equal(labelFor(d.doc, E, 1), '*');
    const {zip} = await lintAfter(d.doc, 'custom converted');
    assert.match(dec(zip.get('word/document.xml')),
      /<w:endnoteReference w:customMarkFollows="1" w:id="1"\/><w:t>\*<\/w:t>/);
    assert.equal(x2.id, 2);
  });

  it('a note marked in a text box is left and reported', async () => {
    const box = '<w:r><w:pict><w:txbxContent>' + p(mark(2)) +
      '</w:txbxContent></w:pict></w:r>';
    const {d, t} = await setup(noteDoc(p(r('a') + mark(1)) +
      p(r('b') + mark(2) + box), {1: noteP('one'), 2: noteP('two')}));
    const out = convertNote(d, t, null, 'allFootnotes');
    assert.equal(out.changed, 1);
    assert.deepEqual(out.skipped, [{kind: F, id: 2, why: 'opaque'}]);
    assert.deepEqual(ids(fmap(d)), [2]);
    assert.deepEqual(bodyMarks(d), [[E, 1], [F, 2]]);
    const one = convertNote(d, t, S.caret(at(para(d, 1), 2)), 'this');
    assert.equal(one.changed, 0);
    assert.match(one.error, /box|kept/);
  });

  it('a note with a link related from its part is left', async () => {
    const doc = await three();
    const link = {id: 'rIdL', type: 'http://schemas.openxmlformats' +
      '.org/officeDocument/2006/relationships/hyperlink',
    target: 'http://example.com/', attrs: [['TargetMode', 'External']]};
    const n2 = doc.notes.footnotes.get(2);
    const lp = {...n2.blocks[0], text: n2.blocks[0].text + OBJ,
      inlines: {...n2.blocks[0].inlines, [n2.blocks[0].text.length]: {
        kind: 'raw', level: 'p', text: 'x', node: {name: 'w:hyperlink',
          attrs: [['r:id', 'rIdL']], children: []}}},
      runs: [{...n2.blocks[0].runs[0],
        end: n2.blocks[0].runs[0].end + 1}]};
    const m = new Map();
    for (const [k, v] of doc.notes.footnotes) {
      m.set(k, {...v, rels: [link], blocks: k === 2 ? [lp] : v.blocks});
    }
    doc.notes = {...doc.notes, footnotes: m};
    const {d, t} = await setup(doc);
    const out = convertNote(d, t, null, 'allFootnotes');
    assert.equal(out.changed, 2);
    assert.deepEqual(out.skipped, [{kind: F, id: 2, why: 'rels'}]);
    oneToOne(d);
  });

  it('an orphan note is left; a duplicate mark follows its note; a ' +
    'broken mark is left', async () => {
    const {d, t} = await setup(noteDoc(p(r('a') + mark(1) + mark(1) +
      mark(9)), {1: noteP('one'), 2: noteP('orphan')}));
    const out = convertNote(d, t, null, 'allFootnotes');
    assert.equal(out.changed, 1);
    assert.deepEqual(out.skipped, [{kind: F, id: 2, why: 'orphan'}]);
    assert.deepEqual(bodyMarks(d), [[E, 1], [E, 1], [F, 9]]);
    assert.deepEqual(ids(fmap(d)), [2]);
  });

  it('in a table, and with the footnotes placed at section ends',
    async () => {
      const tbl = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
        '</w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>' +
        '<w:tr><w:tc>' + p(r('c') + mark(2)) + '</w:tc></w:tr></w:tbl>';
      const {d, t} = await setup(noteDoc(p(r('x') + mark(1)) + tbl +
        p(r('z')), {1: noteP('one'), 2: noteP('cell')}, {settings:
        '<w:footnotePr><w:pos w:val="sectEnd"/></w:footnotePr>'}));
      const tb = para(d, 1);
      convertNote(d, t, null, 'allFootnotes');
      assert.notEqual(para(d, 1), tb);
      assert.equal(para(d, 1).id, tb.id);
      assert.deepEqual(bodyMarks(d), [[E, 1], [E, 2]]);
      oneToOne(d);
      await lintAfter(d.doc, 'a table converted');
      d.undo();
      assert.equal(para(d, 1), tb);
    });

  it('a hostile document: __proto__ and a note facade of a header',
    async () => {
      const {d, t} = await setup(mixed());
      assert.match(convertNote(d, t, null, '__proto__').error,
        /kind of conversion/);
      assert.match(convertNote(d, t, null, 'constructor').error,
        /kind of conversion/);
      const fake = {doc: d.doc, refuses: () => true, apply() {
        throw new Error('no');
      }};
      assert.match(convertNote(fake, null, null, 'swap').error,
        /header/);
    });
});

describe('convertNote: 10,000 notes', () => {
  const make = async (N) => {
    const notes = {};
    let body = '';
    for (let i = 1; i <= N; i++) {
      notes[i] = noteP('n' + i);
      body += p(r('x') + mark(i));
    }
    return noteDoc(body, notes);
  };
  const time = async (N) => {
    let best = Infinity;
    const doc = await make(N);
    for (let k = 0; k < 3; k++) {
      const d = new Document(doc);
      const t0 = performance.now();
      const out = convertNote(d, null, null, 'allFootnotes');
      best = Math.min(best, performance.now() - t0);
      assert.equal(out.changed, N);
      d.undo();
    }
    return best;
  };
  it('linear: 10,000 against 1,000 (load-robust ratio; WORD_PERF=1 ' +
    'for the time)', async () => {
    const small = await time(1000), big = await time(10000);
    const ratio = big / Math.max(small, 0.5);
    console.log(`# convert 10,000 notes: ${big.toFixed(1)} ms, 1,000: ` +
      `${small.toFixed(1)} ms (ratio ${ratio.toFixed(2)}: 10 is ` +
      'linear, 100 quadratic)');
    assert.ok(ratio < 30, 'ratio ' + ratio.toFixed(2));
    if (process.env.WORD_PERF) assert.ok(big < 2000, big + ' ms');
  });
});

describe('customMark', () => {
  it('set: the mark and the note show it; not counted; one step; ' +
    'undo; clear', async () => {
    const {d, t} = await setup(three());
    const n2 = fmap(d).get(2), b0 = para(d), depth = d.undoDepth;
    const bytes = await save(d.doc);
    assert.equal(customWhy(d, F, 2, '*'), null);
    const out = customMark(d, t, F, 2, '*');
    assert.equal(out.changed, true);
    assert.equal(d.undoDepth, depth + 1);
    const x = para(d).inlines[3];
    assert.equal(x.custom, '*');
    assert.equal(x.customNode, undefined);
    assert.deepEqual(x.node.attrs, [['w:customMarkFollows', '1'],
      ['w:id', '2']]);
    assert.equal(fmap(d).get(2).blocks[0].text, '* two');
    assert.equal(labelFor(d.doc, F, 2), '*');
    assert.deepEqual(nums(d, 'footnotes'), {1: '1', 3: '2'});
    oneToOne(d);
    d.undo();
    // (a note's text undone: a new Note deep-equal to the old one,
    // written as it was read)
    assert.deepEqual(fmap(d).get(2), n2);
    assert.equal(para(d).inlines[3], b0.inlines[3]);
    assert.deepEqual(await save(d.doc), bytes);
    assert.deepEqual(nums(d, 'footnotes'), {1: '1', 2: '2', 3: '3'});
    d.redo();
    assert.equal(labelFor(d.doc, F, 2), '*');
    const c = customMark(d, t, F, 2, null);
    assert.equal(c.changed, true);
    const y = para(d).inlines[3];
    assert.equal(y.custom, undefined);
    assert.deepEqual(y.node.attrs, [['w:id', '2']]);
    const own = fmap(d).get(2).blocks[0];
    assert.equal(own.text, OBJ + ' two');
    assert.equal(own.inlines[0].self, true);
    assert.equal(own.inlines[0].node.name, 'w:footnoteRef');
    assert.deepEqual(nums(d, 'footnotes'), {1: '1', 2: '2', 3: '3'});
    oneToOne(d);
  });

  it('changed from one text to another; the same text: no step',
    async () => {
      const {d, t} = await setup(three());
      customMark(d, t, F, 1, '*');
      customMark(d, t, F, 1, '**');
      assert.equal(para(d).inlines[1].custom, '**');
      assert.equal(fmap(d).get(1).blocks[0].text, '** one');
      const depth = d.undoDepth;
      assert.equal(customMark(d, t, F, 1, '**').changed, false);
      assert.equal(d.undoDepth, depth);
      assert.equal(customMark(d, t, F, 3, null).changed, false);
    });

  it('written as Word writes it; read back the same; lint clean',
    async () => {
      const {d, t} = await setup(three());
      customMark(d, t, F, 2, '\u2020');
      const {zip} = await lintAfter(d.doc, 'a custom mark');
      assert.match(dec(zip.get('word/document.xml')),
        /<w:footnoteReference w:customMarkFollows="1" w:id="2"\/><w:t>\u2020<\/w:t>/);
      assert.match(dec(zip.get('word/footnotes.xml')),
        /<w:footnote w:id="2"><w:p><w:r><w:t>\u2020 two<\/w:t><\/w:r><\/w:p>/);
      const back = await readDocx(await save(d.doc));
      assert.equal(back.sections[0].blocks[0].inlines[3].custom,
        '\u2020');
      assert.equal(back.notes.footnotes.get(2).blocks[0].text,
        '\u2020 two');
      assert.deepEqual(Object.fromEntries(numbers(back).footnotes),
        {1: '1', 3: '2'});
      assert.equal(labelFor(back, F, 2), '\u2020');
    });

  it('a note in the reference style: the text keeps the style',
    async () => {
      const {d, t} = await setup(noteDoc(p(r('ab')), {}));
      insertNote(d, t, S.caret(at(para(d), 1)), F);
      customMark(d, t, F, 1, '*');
      const np = fmap(d).get(1).blocks[0];
      assert.equal(np.text, '* ');
      assert.equal(np.runs[0].rStyle, 'FootnoteReference');
      assert.equal(np.runs[0].end, 1);
      customMark(d, t, F, 1, null);
      assert.equal(fmap(d).get(1).blocks[0].runs[0].rStyle,
        'FootnoteReference');
    });

  it('refused inputs, nothing changed', async () => {
    const {d, t} = await setup(three());
    const depth = d.undoDepth;
    for (const bad of ['', ' ', 'a\tb', 'a\u0001', '<', 'a&b', '>',
      'x'.repeat(MARK_MAX + 1), OBJ, 5, {}]) {
      const why = customWhy(d, F, 1, bad);
      assert.ok(typeof why === 'string', JSON.stringify(bad));
      const out = customMark(d, t, F, 1, bad);
      assert.equal(out.changed, false);
      assert.equal(out.error, why);
    }
    assert.equal(customWhy(d, F, 1, 'x'.repeat(MARK_MAX)), null);
    assert.match(customWhy(d, F, 8, '*'), /not there/);
    assert.match(customWhy(d, '__proto__', 1, '*'), /kind/);
    assert.match(customWhy(d, E, 1, '*'), /not there/);
    assert.equal(d.undoDepth, depth);
  });

  it('customOf: the text the marks of a note show, or null', async () => {
    const {d, t} = await setup(three());
    assert.equal(customOf(d.doc, F, 2), null);
    customMark(d, t, F, 2, '*');
    assert.equal(customOf(d.doc, F, 2), '*');
    assert.equal(customOf(d.doc, F, 1), null);
    assert.equal(customOf(d.doc, '__proto__', 1), null);
    assert.equal(customOf(d.doc, E, 9), null);
  });

  it('a note with no mark is refused', async () => {
    const {d, t} = await setup(noteDoc(p(r('a') + mark(1)),
      {1: noteP('one'), 2: noteP('orphan')}));
    assert.match(customMark(d, t, F, 2, '*').error, /no mark/);
  });

  it('from the notes mode: the facade\'s note', async () => {
    const {d} = await setup(three());
    const fd = facadeOf(d, {note: {kind: F, id: 3}});
    const out = customMark(fd, null, F, 3, '#');
    assert.equal(out.changed, true);
    assert.equal(fd.story.blocks[0].text, '# three');
    assert.equal(labelFor(d.doc, F, 3), '#');
  });

  it('then converted: the custom mark goes with the note', async () => {
    const {d, t} = await setup(three());
    customMark(d, t, F, 2, '*');
    convertNote(d, t, S.caret(at(para(d), 4)), 'this');
    const x = para(d).inlines[3];
    assert.equal(x.note, E);
    assert.equal(x.custom, '*');
    assert.equal(emap(d).get(1).blocks[0].text, '* two');
    assert.equal(labelFor(d.doc, E, 1), '*');
    assert.deepEqual(nums(d, 'footnotes'), {1: '1', 3: '2'});
    const {zip} = await lintAfter(d.doc, 'custom then converted');
    assert.match(dec(zip.get('word/document.xml')),
      /<w:endnoteReference w:customMarkFollows="1" w:id="1"\/><w:t>\*<\/w:t>/);
    const back = await readDocx(await save(d.doc));
    assert.equal(back.sections[0].blocks[0].inlines[3].custom, '*');
  });
});

describe('custom mark text: what the writer can write', () => {
  it('XML-invalid characters are refused; a surrogate pair is one ' +
    'character', async () => {
    const {d, t} = await setup(three());
    const depth = d.undoDepth;
    for (const bad of ['\ud800', 'ab\udc00', '\udc00\ud800', '￾',
      '￿', 'a\u000b', '\u000c', '\u0008', 'x\u001f', '\r',
      '\u0085']) {
      const why = customWhy(d, F, 1, bad);
      assert.equal(typeof why, 'string', JSON.stringify(bad));
      assert.deepEqual(customMark(d, t, F, 1, bad),
        {changed: false, error: why});
    }
    assert.equal(d.undoDepth, depth);
    const emoji = '😀';
    assert.equal(customWhy(d, F, 1, emoji.repeat(MARK_MAX)), null);
    assert.match(customWhy(d, F, 1, emoji.repeat(MARK_MAX + 1)),
      /at most/);
    customMark(d, t, F, 1, emoji);
    const back = await readDocx(await save(d.doc));
    assert.equal(back.sections[0].blocks[0].inlines[1].custom, emoji);
  });

  it('random hostile strings: taken => written and read back; ' +
    'refused => nothing changed', async () => {
    const ABC = ['\u0000', '\u0009', '\u000b', '\u001f', '\u007f',
      '\u0085', '\ud800', '\udbff', '\udc00', '😀', '￾',
      '￿', '￼', '﻿', '<', '>', '&', '"', "'", ' ', 'a',
      '*', 'é', 'ß', '†', ' ', 'Z'];
    let seed = 12345;
    const rnd = (n) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const {d, t} = await setup(three());
    let took = 0, refused = 0;
    for (let k = 0; k < 300; k++) {
      let s = '';
      for (let n = 1 + rnd(12); n > 0; n--) s += ABC[rnd(ABC.length)];
      const why = customWhy(d, F, 2, s), depth = d.undoDepth;
      const out = customMark(d, t, F, 2, s);
      if (why !== null) {
        refused++;
        assert.deepEqual(out, {changed: false, error: why});
        assert.equal(d.undoDepth, depth, JSON.stringify(s));
        continue;
      }
      took++;
      assert.equal(out.error, undefined, JSON.stringify(s));
      const back = await readDocx(await save(d.doc));
      assert.equal(back.sections[0].blocks[0].inlines[3].custom, s,
        JSON.stringify(s));
      assert.ok(back.notes.footnotes.get(2).blocks[0].text
        .startsWith(s));
    }
    assert.ok(took > 20 && refused > 20, took + ' / ' + refused);
  });

  it('a mark node with no attributes array (hand-built)', async () => {
    const doc = await three();
    const b = doc.sections[0].blocks[0], x = b.inlines[1];
    const nb = {...b, inlines: {...b.inlines, 1: {...x,
      node: {name: 'w:footnoteReference', children: []}}}};
    doc.sections = [{...doc.sections[0], blocks: [nb,
      ...doc.sections[0].blocks.slice(1)]}];
    const {d, t} = await setup(doc);
    const out = customMark(d, t, F, 1, '*');
    assert.equal(out.changed, true);
    assert.deepEqual(para(d).inlines[1].node.attrs,
      [['w:customMarkFollows', '1']]);
    assert.equal(customMark(d, t, F, 1, null).changed, true);
    assert.deepEqual(para(d).inlines[1].node.attrs, []);
  });
});

describe('convertPlan', () => {
  it('what would change, nothing changed; refusals as convertNote',
    async () => {
      const {d} = await setup(mixed());
      const before = d.doc.notes, depth = d.undoDepth;
      assert.deepEqual(convertPlan(d, null, 'swap'),
        {changed: 4, skipped: []});
      assert.deepEqual(convertPlan(d, null, 'nonsense').changed, 0);
      assert.match(convertPlan(d, null, 'nonsense').error, /kind/);
      assert.equal(d.doc.notes, before);
      assert.equal(d.undoDepth, depth);
    });

  it('a note marked in a text box: refused for this note, also from ' +
    'its facade (the notes mode)', async () => {
    const box = '<w:r><w:pict><w:txbxContent>' + p(mark(1)) +
      '</w:txbxContent></w:pict></w:r>';
    const {d} = await setup(noteDoc(p(r('a') + mark(1) + box),
      {1: noteP('one')}));
    const fd = facadeOf(d, {note: {kind: F, id: 1}});
    assert.match(convertPlan(fd, null, 'this').error, /text box/);
    assert.match(convertWhy(d, S.caret(at(para(d), 2)), 'this'),
      /text box/);
    assert.deepEqual(convertPlan(d, null, 'allFootnotes'),
      {changed: 0, skipped: [{kind: F, id: 1, why: 'opaque'}]});
  });
});

describe('customForInsert', () => {
  const C = (f, p) => customForInsert(f, p);
  it('an untouched pre-fill makes a numbered note', () => {
    assert.equal(C('*', '*'), '');
    assert.equal(C('', ''), '');
  });
  it('a changed field is the custom mark', () => {
    assert.equal(C('#', '*'), '#');
    assert.equal(C('*', ''), '*');
    assert.equal(C('', '*'), '');
  });
});
