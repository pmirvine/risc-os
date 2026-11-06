// The caret kept out of a table of contents (./TocCaret): a new table
// with no entries is 'No table of contents entries found.' and a
// paragraph holding only the field's end mark, which looks like an
// empty line. A click on that line, Up / Down onto it, typing, Return
// and Backspace there never leave the caret before the end mark
// (inside the table's result, where Update would delete what is
// typed). insertToc leaves an ordinary paragraph after a table that
// ends a document or comes before another table; a selection of the
// field's hidden code alone is made the whole field. Real Document
// and DocLayout with the fake measurer.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {insertToc} from '../../tools/moreapps/!Letters/TocCmd';
import {tocFields, entriesOf}
  from '../../tools/moreapps/!Letters/TocUpdate';
import {run} from '../../tools/moreapps/!Letters/FieldPasses';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {caret, select, move}
  from '../../tools/moreapps/!Letters/Selection';
import {applyStyle} from '../../tools/moreapps/!Letters/StyleApply';
import {splitPara} from '../../tools/moreapps/!Letters/Edit';
import {deleteBack, deleteForward, deleteSelection}
  from '../../tools/moreapps/!Letters/EditDel';
import {whole} from '../../tools/moreapps/!Letters/FieldEdit';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {outOf} from '../../tools/moreapps/!Letters/TocCaret';
import {compare} from '../../tools/moreapps/!Letters/DocPos';
import {loadStyles, tm} from './word-docs.mjs';
import {lintAfter} from './lint-after.mjs';
import {emit} from './word-emit.mjs';

before(loadStyles);
const NOW = new Date(2026, 10, 6, 9, 0);
const blocks = (d) => d.doc.sections[0].blocks;
const plain = (b) => b.text.split(OBJ).join('');
const brief = (d) => entriesOf(d.doc, tocFields(d.doc)[0])
  .map((e) => [e.level, e.text]);
const NONE = 'No table of contents entries found.';

/** A new document with an empty table at its start. */
function fresh() {
  const d = new Document(newDoc()), t = new Typing(d);
  const res = insertToc(d, t, caret({id: blocks(d)[0].id, off: 0}),
    {});
  assert.ok(res, 'inserted');
  const f = tocFields(d.doc)[0];
  return {d, t, res, f, B: findBlock(d.doc, f.end.id).b};
}
const after = (f) => ({id: f.end.id, off: f.end.off + 1});
const layout = (d) => {
  const L = new DocLayout(d.doc, tm(), null, {});
  L.layout(800);
  return L;
};
/** Whether pos is inside f's result (before its end mark). */
const inside = (d, pos) => {
  const f = tocFields(d.doc)[0];
  return pos.id === f.end.id && pos.off <= f.end.off;
};

describe('TocCaret outOf', () => {
  it('the start of the end-mark line goes after the mark', () => {
    const {d, f} = fresh();
    assert.equal(f.end.off, 0);
    assert.deepEqual(outOf(d.doc, {id: f.end.id, off: 0}), after(f));
    assert.deepEqual(outOf(d.doc, after(f)), after(f));
  });

  it('a place in the result\'s text is left alone', () => {
    const {d, f} = fresh();
    const p = {id: f.sep.id, off: f.sep.off + 3};
    assert.deepEqual(outOf(d.doc, p), p);
  });

  it('no field: the same position', () => {
    const d = new Document(newDoc());
    const p = {id: blocks(d)[0].id, off: 0};
    assert.equal(outOf(d.doc, p), p);
  });
});

describe('the end-mark line of an empty table', () => {
  it('a click on it lands after the mark', () => {
    const {d, f} = fresh();
    const L = layout(d), r = L.caretRect(after(f));
    for (const dx of [-50, 0, 30, 300]) {
      const h = L.hitTest(r.x + dx, r.y + r.h / 2).pos;
      assert.deepEqual(h, after(f), `dx ${dx}`);
    }
  });

  it('a heading typed where the click puts the caret is an entry ' +
    'after Update, and survives it', () => {
    const {d, t, f} = fresh();
    const L = layout(d), r = L.caretRect(after(f));
    const h = L.hitTest(r.x + 30, r.y + r.h / 2).pos;
    const s = t.type(caret(h), 'Introduction');
    applyStyle(d, t, s, 'Heading1');
    run(d, {now: NOW}, null);
    assert.deepEqual(brief(d), [[1, 'Introduction']]);
    assert.ok(blocks(d).some((b) => b.pStyle === 'Heading1' &&
      plain(b) === 'Introduction'), 'the heading is still there');
  });

  it('Down from the table\'s line onto it: after the mark', () => {
    const {d, f} = fresh();
    const L = layout(d);
    const s = move(caret({id: f.sep.id, off: f.sep.off + 3}), L,
      'down');
    assert.deepEqual(s.head, after(f));
  });

  it('typing at the start of the line goes after the mark', () => {
    const {d, t, f} = fresh();
    const s = t.type(caret({id: f.end.id, off: 0}), 'Body');
    const g = tocFields(d.doc)[0];
    assert.equal(g.end.off, 0, 'the mark stays first');
    const B = findBlock(d.doc, g.end.id).b;
    assert.equal(plain(B), 'Body');
    assert.deepEqual(s.head, {id: B.id, off: 5});
  });

  it('Return there: the mark stays, the caret goes on after it',
    async () => {
      for (const off of [0, 1]) {
        const {d, f} = fresh();
        const s = splitPara(d, caret({id: f.end.id, off}));
        assert.ok(s && s.head, `off ${off}`);
        const g = tocFields(d.doc)[0];
        assert.equal(g.end.id, f.end.id, `off ${off}: same paragraph`);
        assert.ok(!inside(d, s.head), `off ${off}: caret outside`);
        assert.notEqual(s.head.id, g.end.id, `off ${off}: a new line`);
        await lintAfter(d.doc, 'return ' + off);
      }
    });

  it('Backspace after the mark: the caret is not left before it',
    () => {
      const {d, t, f} = fresh();
      const s = deleteBack(d, caret(after(f)));
      assert.ok(s && s.head);
      assert.equal(tocFields(d.doc).length, 1, 'the table stays');
      assert.ok(!inside(d, s.head), JSON.stringify(s.head));
      const s2 = t.type(s, 'After');
      assert.ok(!inside(d, s2.head));
      run(d, {now: NOW}, null);
      assert.ok(blocks(d).some((b) => plain(b).endsWith('After')),
        'what was typed survives Update');
    });
});

/** A table made from a heading that follows it: after insert the
 *  heading paragraph starts with the table's end mark. */
function headed() {
  const d = new Document(newDoc()), t = new Typing(d);
  const b0 = blocks(d)[0];
  let s = t.type(caret({id: b0.id, off: 0}), 'Introduction');
  applyStyle(d, t, s, 'Heading1');
  s = splitPara(d, caret({id: b0.id, off: blocks(d)[0].text.length}));
  s = t.type(s, 'Body text here');
  applyStyle(d, t, s, 'Normal');
  insertToc(d, t, caret({id: b0.id, off: 0}), {});
  const f = tocFields(d.doc)[0];
  return {d, t, f, H: findBlock(d.doc, f.end.id).b};
}

describe('backward keys from just after the end mark', () => {
  const cases = () => {
    const a = fresh(), b = headed();
    assert.match(plain(b.H), /^Introduction/, 'the end in the heading ' + JSON.stringify(b.H.text));
    assert.equal(b.f.end.off, 0);
    return [['end-mark line', a.d, a.f], ['heading', b.d, b.f]];
  };
  for (const cmd of ['wordLeft', 'paraStart', 'left', 'up']) {
    for (const ext of [false, true]) {
      it(`${cmd}${ext ? ' with Shift' : ''} goes on, not stuck`, () => {
        for (const [what, d, f] of cases()) {
          const L = layout(d), from = after(f);
          const s = move(caret(from), L, cmd, ext);
          assert.ok(compare(L, s.head, from) < 0,
            `${what}: ${JSON.stringify(s.head)}`);
          assert.ok(!inside(d, s.head), what + ': not inside');
          if (ext) assert.deepEqual(s.anchor, from, what + ': anchor');
        }
      });
    }
  }

  it('Ctrl-Left (and Ctrl-Up) walked from the end reach the start', () => {
    for (const cmd of ['wordLeft', 'paraStart']) {
      for (const {d} of [fresh(), headed()]) {
        const L = layout(d), start = L.docStart();
        let s = caret(L.docEnd()), n = 0;
        while (compare(L, s.head, start) !== 0) {
          const s2 = move(s, L, cmd);
          assert.ok(compare(L, s2.head, s.head) < 0,
            `${cmd} stuck at ${JSON.stringify(s.head)}`);
          s = s2;
          assert.ok(++n < 200, 'too many steps');
        }
      }
    }
  });

  it('the caret can still go before the table: Ctrl-Home, a click ' +
    'on its first line', () => {
    const {d, f} = headed();
    const L = layout(d);
    const h = move(caret(after(f)), L, 'docHome').head;
    assert.deepEqual(h, {id: f.begin.id, off: 0});
  });
});

describe('insertToc: the paragraph after the table', () => {
  it('at the end of a document: an ordinary empty paragraph after ' +
    'it, with the caret', async () => {
    const {d, res, f, B} = fresh();
    const bs = blocks(d), k = bs.indexOf(B);
    assert.equal(plain(B), '', 'the end-mark paragraph');
    const C = bs[k + 1];
    assert.ok(C && C.type === 'p', 'a paragraph after it');
    assert.equal(C.text, '');
    assert.ok(!C.pStyle || C.pStyle === 'Normal', C.pStyle);
    assert.deepEqual(res.sel.head, {id: C.id, off: 0});
    assert.equal(plain(bs[k - 1]), NONE);
    await lintAfter(d.doc, 'toc then para');
    // one undo step takes all of it away
    d.undo();
    assert.equal(blocks(d).length, 1);
    assert.equal(tocFields(d.doc).length, 0);
  });

  it('text after the caret: no extra paragraph, caret after the mark',
    () => {
      const d = new Document(newDoc()), t = new Typing(d);
      const s = t.type(caret({id: blocks(d)[0].id, off: 0}), 'Hello');
      const res = insertToc(d, t, caret({id: s.head.id, off: 0}), {});
      const f = tocFields(d.doc)[0];
      assert.deepEqual(res.sel.head, after(f));
      assert.equal(blocks(d).length, 2);
    });
});

describe('as saved', () => {
  it('an empty table with a heading after it, then updated: both ' +
    'clean (and handed to the real-Word check)', async () => {
    const {d, t, res} = fresh();
    const s = t.type(res.sel, 'Introduction');
    applyStyle(d, t, s, 'Heading1');
    const e = await lintAfter(d.doc, 'empty toc, heading after');
    emit('toccaret-empty-then-heading', e.bytes);
    run(d, {now: NOW}, null);
    assert.deepEqual(brief(d), [[1, 'Introduction']]);
    const u = await lintAfter(d.doc, 'toc updated');
    emit('toccaret-updated', u.bytes);
  });
});

describe('a selection of the hidden code alone', () => {
  it('is made the whole field, so the table goes whole or not at all',
    () => {
      const {d, f} = fresh();
      const code = select({id: f.begin.id, off: f.begin.off + 1},
        {id: f.begin.id, off: f.begin.off + 2});
      const w = whole(d.doc, code);
      assert.deepEqual([w.anchor, w.head], [{id: f.begin.id,
        off: f.begin.off}, after(f)]);
      for (const fn of [deleteBack, deleteForward, deleteSelection]) {
        const {d: d2, f: f2} = fresh();
        fn(d2, select({id: f2.begin.id, off: f2.begin.off + 1},
          {id: f2.begin.id, off: f2.begin.off + 2}));
        const all = blocks(d2).map((b) => b.text).join('|');
        const n = tocFields(d2.doc).length;
        assert.ok(n === 1 || !all.includes(OBJ), fn.name +
          ': no table without its code ' + JSON.stringify(all));
        if (n === 1) assert.match(tocFields(d2.doc)[0].instr, /TOC/);
      }
    });
});
