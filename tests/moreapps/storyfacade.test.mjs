// StoryFacade (Batch D P7.3, D14): a Document-shaped object whose doc
// is a header or footer story seen as a one-section document, and
// whose apply / atomic / group forward to the real Document with the
// story set, so every existing command edits the story unchanged:
// typing, Enter, bold, a list, Insert > Table, a picture through it
// change only the story; undo is the real Document's; the commands
// a story cannot take (page and section breaks) are refused (null:
// the window beeps) and change nothing; and when the story itself is
// removed (undo of its creation) the facade reports it gone. Then the
// window's mode (./HdrEdit) on a view of a Print layout: entering
// changes nothing (a page with no header gets one not made yet:
// hdrcmd.test.mjs makes it on the first edit), the story's layout is on its page (./HdrView
// PlaceShift), undo puts the caret in the story, and a story gone
// takes the window out of the mode (no stale facade); a story step
// undone from the body takes the window into that story (P7.5,
// ./HdrStep: more in hdrcmd.test.mjs); the mode's labels (./HdrView
// labelOf). A note (Batch E2): facadeOf(d, {note: {kind, id}}) is
// the same for one footnote or endnote, typing, bold, a list, find,
// a picture and undo running on it unchanged.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {facadeOf, REFUSED}
  from '../../tools/moreapps/!Letters/StoryFacade';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {run} from '../../tools/moreapps/!Letters/EditApply';
import {apply as format} from '../../tools/moreapps/!Letters/FormatApply';
import {EMPTY} from '../../tools/moreapps/!Letters/Pending';
import {insertTable} from '../../tools/moreapps/!Letters/TblInsert';
import {insert as insertPic}
  from '../../tools/moreapps/!Letters/InsertPicture';
import {freeName} from '../../tools/moreapps/!Letters/StoryWrite';
import {addRel} from '../../tools/moreapps/!Letters/DocParts';
import {withRef} from '../../tools/moreapps/!Letters/SectRefs';
import {docMap} from '../../tools/moreapps/!Letters/PicRead';
import {docScope} from '../../tools/moreapps/!Letters/WriteBody';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {usedDocPrIds} from '../../tools/moreapps/!Letters/PicIds';
import {newPara, deepEqual, sameStories}
  from '../../tools/moreapps/!Letters/Model';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {p, r, REL} from './build-docx.mjs';
import {MAX_NOTE_ID} from '../../tools/moreapps/!Letters/ModelCheck';
import {withHeaders, freeze} from './story-fixtures.mjs';
import {pngBytes} from './pic-fixtures.mjs';
import {lintAfter} from './lint-after.mjs';
import {tm} from './word-docs.mjs';
import {wordHf, BODY} from './hf-fixtures.mjs';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {editLayout, layoutStory}
  from '../../tools/moreapps/!Letters/StoryLayout';
import {enterMode, leaveMode}
  from '../../tools/moreapps/!Letters/HdrEdit';
import {afterChange} from '../../tools/moreapps/!Letters/HdrStep';
import {PlaceShift, labelOf, hdrAt}
  from '../../tools/moreapps/!Letters/HdrView';
import {toggle} from '../../tools/moreapps/!Letters/FormatSet';
import {toggleList} from '../../tools/moreapps/!Letters/ListMake';
import {search} from '../../tools/moreapps/!Letters/Find';
import {ids} from '../../tools/moreapps/!Letters/Walk';
import {noteDoc, noteP, mark} from './note-fixtures.mjs';
import {addBookmark} from '../../tools/moreapps/!Letters/Bookmarks';
import {nextNoteId, newNote}
  from '../../tools/moreapps/!Letters/OpsNotes';

const H = 'word/header1.xml', F = 'word/footer1.xml';
const DATE = new Date(2024, 4, 6, 7, 8, 10);
const write = (doc) => writeDocx(doc, {date: DATE});
const dec = (b) => new TextDecoder().decode(b);

let opened, bytes0;
before(async () => {
  opened = freeze(await readDocx(await withHeaders(
    p(r('body one')) + p(r('body two')),
    {default: {hdr: p(r('Head one')) + p(r('Head two')),
      ftr: p(r('Foot'))}})));
  bytes0 = await write(opened);
});

/** A Document over `opened` (its arrays its own; objects frozen). */
const fresh = () => new Document({...opened, sections:
  opened.sections.map((s) => ({...s, blocks: s.blocks.slice()}))});
const hdr = (d) => d.doc.stories.get(H);
const htexts = (d) => hdr(d).blocks.map((b) => (b.type === 'p'
  ? b.text : '#' + b.type));
const caretIn = (d, k, off) => S.caret({id: hdr(d).blocks[k].id, off});

/** Run cmd(f, typing) on a fresh document's header facade; check
 *  that only the header changed, then undo it through the real
 *  Document back to the document as opened (bytes too). */
async function onlyStory(cmd, check, opts = {}) {
  const d = fresh(), f = facadeOf(d, H, 0), t = new Typing(f);
  const body = d.doc.sections, rels = d.doc.rels;
  const foot = d.doc.stories.get(F);
  const out = cmd(f, t, d);
  assert.ok(out, 'the command did something');
  assert.equal(d.doc.sections, body, 'the body untouched');
  assert.ok(deepEqual(d.doc.sections, opened.sections), 'body as read');
  assert.equal(d.doc.stories.get(F), foot, 'the footer shared');
  assert.notEqual(hdr(d), opened.stories.get(H), 'a new header');
  if (opts.mainRels) {
    // (a document-level relationship goes to the main part: the
    // numbering one of a first list, Batch E2 fix)
    assert.ok(rels.every((x) => d.doc.rels.includes(x)), 'kept');
    assert.ok(d.doc.rels.some((x) => /numbering$/.test(x.type)));
  } else assert.equal(d.doc.rels, rels, 'the main relationships kept');
  if (check) await check(d, f, out);
  await lintAfter(d.doc, 'after the command');
  while (d.canUndo) d.undo();
  assert.ok(sameStories(d.doc.stories, opened.stories), 'undone');
  assert.deepEqual(await write(d.doc), bytes0, 'bytes as opened');
  return d;
}

describe('the facade', () => {
  it('is memoised per (Document, part); doc per state', () => {
    const d = fresh();
    const f = facadeOf(d, H, 0);
    assert.equal(facadeOf(d, H, 0), f);
    assert.notEqual(facadeOf(d, F, 0), f);
    assert.notEqual(facadeOf(fresh(), H, 0), f);
    const v = f.doc;
    assert.equal(f.doc, v, 'the same view while nothing changes');
    assert.equal(v.sections.length, 1);
    assert.equal(v.sections[0].blocks, hdr(d).blocks);
    assert.equal(v.sections[0].props, d.doc.sections[0].props);
    assert.equal(v.meta.mainPart, H);
    assert.equal(v.styles, d.doc.styles);
    assert.deepEqual(v.rels, []);
    assert.ok(!v.stories.has(H), 'not itself a story of its view');
    assert.ok(v.stories.has(F));
    const body = v.stories.get(d.doc.meta.mainPart);
    assert.deepEqual(body.blocks, d.doc.sections[0].blocks,
      'the body seen by the scanners as a story');
    new Typing(f).type(caretIn(d, 0, 4), 'X');
    assert.notEqual(f.doc, v, 'a new view after an edit');
    assert.equal(f.doc.sections[0].blocks[0].text, 'HeadX one');
    for (const bad of [null, undefined, 3, {}])
      assert.throws(() => facadeOf(d, bad, 0), RangeError);
    assert.throws(() => facadeOf({}, H, 0), RangeError);
  });

  it('a position in the story is found as a body position', () => {
    const d = fresh(), f = facadeOf(d, H, 0);
    const loc = findBlock(f.doc, hdr(d).blocks[1].id);
    assert.deepEqual(loc.at, [0, 1]);
    assert.equal(loc.story, null);
  });
});

describe('every command, through the facade, changes only the story',
  () => {
    it('typing', () => onlyStory((f, t, d) =>
      t.type(caretIn(d, 0, 4), 'X'), (d) => {
      assert.deepEqual(htexts(d), ['HeadX one', 'Head two']);
      assert.equal(d.undoDepth, 1);
    }));

    it('Enter', () => onlyStory((f, t, d) =>
      run('enter', f, t, caretIn(d, 0, 4)), (d, f, out) => {
      assert.deepEqual(htexts(d), ['Head', ' one', 'Head two']);
      assert.equal(out.head.id, hdr(d).blocks[1].id);
    }));

    it('bold', () => onlyStory((f, t, d) => format('bold', f, t,
      S.select({id: hdr(d).blocks[0].id, off: 0},
        {id: hdr(d).blocks[0].id, off: 4}), undefined, EMPTY), (d) => {
      const runs = hdr(d).blocks[0].runs;
      assert.ok(runs.some((x) => x.rPr.b === true && x.start === 0 &&
        x.end === 4), JSON.stringify(runs));
    }));

    it('a list (bullets)', () => onlyStory((f, t, d) => format(
      'bullets', f, t, caretIn(d, 1, 0), undefined, EMPTY), async (d) => {
      const b = hdr(d).blocks[1];
      assert.ok(b.pPr.numPr, 'a list item');
      assert.ok(d.doc.numbering, 'its numbering in the document');
      const xml = dec((await readZip(await write(d.doc))).get(H));
      assert.match(xml, /<w:numId w:val="\d+"\/>/);
    }, {mainRels: true}));

    it('Insert > Table, at the last paragraph: one is kept after it',
      () => onlyStory((f, t, d) => insertTable(f, caretIn(d, 1, 8),
        {cols: 2, rows: 1}), (d) => {
        assert.deepEqual(htexts(d), ['Head one', 'Head two', '#tbl',
          '']);
      }));

    it('a picture: its part and relationship are the header\'s', () =>
      onlyStory((f, t, d) => insertPic(f, caretIn(d, 0, 0),
        {bytes: pngBytes(4, 2)}), async (d) => {
        const st = hdr(d), rel = st.rels.find((x) =>
          /image$/.test(x.type));
        assert.ok(rel, 'an image relationship in the header\'s rels');
        assert.equal(rel.target, 'media/image1.png');
        assert.ok(d.doc.parts.has('word/media/image1.png'));
        assert.ok(!d.doc.rels.some((x) => /image$/.test(x.type)));
        const z = await readZip(await write(d.doc));
        assert.match(dec(z.get('word/_rels/header1.xml.rels')),
          /Target="media\/image1.png"/);
        const back = await readDocx(await write(d.doc));
        assert.equal(back.stories.get(H).blocks[0].text[0], '￼');
      }));

    it('a picture\'s docPr id is past the body\'s', async () => {
      const doc = await readDocx(await withHeaders(
        p(r('x')) + p('<w:r><w:drawing><wp:inline ' +
          'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/' +
          'wordprocessingDrawing"><wp:extent cx="1" cy="1"/>' +
          '<wp:docPr id="70" name="P"/></wp:inline></w:drawing></w:r>'),
        {default: p(r('Head'))}));
      const d = new Document(doc), f = facadeOf(d, H, 0);
      assert.ok(usedDocPrIds(f.doc).ids.has(70), 'the body seen');
    });

    it('undo and redo are the real Document\'s, one step each', () => {
      const d = fresh(), f = facadeOf(d, H, 0), t = new Typing(f);
      t.type(caretIn(d, 0, 0), 'A');
      run('enter', f, t, caretIn(d, 0, 1));
      assert.equal(d.undoDepth, 2);
      assert.equal(f.canUndo, true);
      f.undo();
      assert.deepEqual(htexts(d), ['AHead one', 'Head two']);
      d.undo();
      assert.ok(sameStories(d.doc.stories, opened.stories));
      assert.equal(f.canRedo, true);
      f.redo();
      assert.deepEqual(htexts(d), ['AHead one', 'Head two']);
    });
  });

describe('refused in a story', () => {
  for (const id of ['pageBreak', 'sectionNext', 'sectionContinuous',
    'sectionEven', 'sectionOdd']) {
    it(id + ': null (a beep), nothing changed, no step', () => {
      const d = fresh(), f = facadeOf(d, H, 0);
      assert.ok(REFUSED.has(id));
      assert.equal(f.refuses(id), true);
      const out = run(id, f, new Typing(f), caretIn(d, 0, 2));
      assert.equal(out, null);
      assert.equal(d.undoDepth, 0);
      assert.ok(sameStories(d.doc.stories, opened.stories));
    });
  }

  it('the real Document refuses nothing of them', () => {
    const d = fresh();
    assert.equal(typeof d.refuses, 'undefined');
  });

  it('section ops: RangeError, nothing changed', () => {
    const d = fresh(), f = facadeOf(d, H, 0);
    const s = d.doc.sections[0];
    for (const op of [{op: 'splitSection', at: [0, 1]},
      {op: 'mergeSection', at: 0},
      {op: 'setSection', at: 0, raw: s.raw, props: s.props}]) {
      assert.throws(() => f.apply(op), RangeError, op.op);
      assert.throws(() => f.apply({op: 'compound', ops: [op]}),
        RangeError);
    }
    assert.equal(d.undoDepth, 0);
    assert.equal(d.doc.sections[0], s);
    assert.ok(sameStories(d.doc.stories, opened.stories));
  });

  it('an op given another story is refused', () => {
    const d = fresh(), f = facadeOf(d, H, 0);
    assert.throws(() => f.apply({op: 'replaceText', story: F,
      block: [0, 0], at: 0, del: 0, ins: 'x'}), RangeError);
    assert.ok(sameStories(d.doc.stories, opened.stories));
  });
});

describe('story gone (Review Focus 2)', () => {
  /** A Document with a new even header made in one step. */
  function created() {
    const d = fresh();
    const map = docScope(d.doc).map;
    let name;
    d.atomic(() => {
      const doc = d.doc;
      name = freeName(doc, 'hdr');
      d.apply({op: 'setStory', part: name, story: freeze({part: name,
        kind: 'hdr', root: {name: 'w:hdr', attrs: []}, prolog: null,
        blocks: [newPara('Even head')], rels: null, relsPart: null,
        orig: [], bytes: null})});
      const {rels, id} = addRel(doc.rels, {kind: 'header',
        target: name.slice('word/'.length)});
      d.apply({op: 'setDocPart', key: 'rels', value: rels});
      const s = doc.sections[0];
      d.apply({op: 'setSection', at: 0, raw: s.raw,
        props: withRef(s.props, 'hdr', 'even', id, map)});
    });
    return {d, name};
  }

  it('undo of its creation: gone; redo: back', () => {
    const {d, name} = created();
    const f = facadeOf(d, name, 0), t = new Typing(f);
    assert.equal(f.gone, false);
    t.type(S.caret({id: f.doc.sections[0].blocks[0].id, off: 4}), 'X');
    d.undo();
    assert.equal(f.gone, false);
    d.undo();
    assert.equal(f.gone, true);
    assert.deepEqual(f.doc.sections[0].blocks, [], 'an empty view');
    assert.throws(() => f.apply({op: 'replaceText', block: [0, 0],
      at: 0, del: 0, ins: 'y'}), RangeError);
    assert.equal(d.canRedo, true, 'the refused op left redo alone');
    assert.ok(sameStories(d.doc.stories, opened.stories));
    d.redo();
    assert.equal(f.gone, false);
    assert.equal(f.doc.sections[0].blocks[0].text, 'Even head');
  });
});

/** A window's view (./EditView's fields ./HdrEdit uses) over Document
 *  d in Print layout; relaid() lays the body out again (an edit). */
function viewOf(d) {
  const v = {real: d, hdr: null, pending: null, selRev: 0,
    formatListeners: [], typing: new Typing(d),
    get d() { return this.hdr ? this.hdr.facade : this.real; },
    get bodyL() { this.ensure(); return this._L; },
    get L() {
      this.ensure();
      const L = this.hdr && this.hdr.layout();
      if (!L && this.hdr) leaveMode(this);
      return L || this._L;
    },
    ensure() {
      if (!this._stale) return;
      this._stale = false;
      this.relaid();
    },
    relaid() {
      const L = new DocLayout(d.doc, tm(), this._L, {top: 40});
      L.layout(900);
      L.place = PlacePrint(L, new Pages(printGalley(L)).finish());
      L.layout(900);
      this._L = L;
    }};
  v.relaid();
  v.sel = S.caret(v._L.docStart());
  // (as ./EditView: stale first, laid out when next asked for)
  d.on('change', (ev) => {
    v._stale = true;
    afterChange(v, ev);
    v.ensure();
  });
  return v;
}

describe('the window\'s mode (./HdrEdit)', () => {
  let heads;
  before(async () => {
    heads = freeze(await readDocx(await wordHf({titlePg: true,
      body: BODY(40), default: {hdr: p(r('Running head')),
        ftr: p(r('Running foot'))}})));
  });
  const doc = () => new Document({...heads, sections: heads.sections
    .map((s) => ({...s, blocks: s.blocks.slice()}))});

  it('page 1 (titlePg, no first header): a story not made yet (P7.4),'
    + ' nothing changed', () => {
    const d = doc(), v = viewOf(d), sel = v.sel;
    const m = enterMode(v, {kind: 'hdr', i: 0});
    assert.ok(m !== null && v.hdr === m, 'entered');
    assert.ok(m.facade.pending !== null, 'pending');
    assert.equal(m.type, 'first');
    assert.ok(!d.doc.stories.has(m.part), 'not in the document');
    assert.equal(d.undoDepth, 0);
    leaveMode(v);
    assert.ok(v.typing.d === d);
    assert.deepEqual(v.sel, sel);
    assert.ok(enterMode(v, {kind: 'hdr', i: 99}) === null, 'no page');
  });

  it('page 2: entering changes nothing; the story on its page', () => {
    const d = doc(), v = viewOf(d), body = v.sel;
    const m = enterMode(v, {kind: 'hdr', i: 1});
    assert.ok(m);
    assert.equal(v.hdr, m);
    assert.equal(v.d, m.facade);
    assert.equal(v.typing.d, m.facade);
    assert.equal(m.bodySel, body);
    assert.equal(d.undoDepth, 0);
    const L = v.L, Pl = v.bodyL.place, pg = Pl.pages.at(1);
    const r0 = Pl.sheet.rect(pg), geo = v.bodyL.geom(0);
    assert.equal(L.place.view, 'story');
    assert.equal(L.top, v.bodyL.top);
    const c = L.caretRect(L.docStart(), 'down');
    assert.ok(c.y >= r0.y + geo.mar.header - 1 && c.y < r0.y +
      pg.bodyTop, JSON.stringify({c, r0, pg: pg.bodyTop}));
    assert.ok(c.x >= r0.x + geo.mar.left - 1, 'at the left margin');
    const h = L.hitTest(c.x + 1, c.y + 2);
    assert.equal(h.pos.id, L.docStart().id, 'a hit there is in it');
    const a = hdrAt(v.bodyL, c.x + 1, c.y + 2);
    assert.deepEqual([a.i, a.kind], [1, 'hdr']);
    assert.equal(m.info(), 'Page 2 of ' + Pl.pages.count +
      ' - Header');
  });

  it('typing, undo: the caret in the story; leave: the body\'s back',
    () => {
      const d = doc(), v = viewOf(d), body = v.sel;
      enterMode(v, {kind: 'hdr', i: 1});
      v.sel = S.caret({...v.L.docStart(), off: 7});
      v.sel = v.typing.type(v.sel, 'XY');
      assert.equal(v.d.doc.sections[0].blocks[0].text, 'RunningXY head');
      assert.ok(v.hdr, 'still in the mode after an edit');
      v.sel = S.caret(v.L.docStart());
      d.undo();
      assert.ok(v.hdr);
      assert.deepEqual(v.sel.head, {id: v.L.docStart().id, off: 7},
        'where the typing began, in the story');
      leaveMode(v);
      assert.equal(v.hdr, null);
      assert.equal(v.typing.d, d);
      assert.deepEqual(v.sel, S.clamp(body, d.doc, null));
    });

  it('story gone: the window leaves the mode, no stale facade', () => {
    const d = doc(), v = viewOf(d);
    const m = enterMode(v, {kind: 'hdr', i: 1});
    d.apply({op: 'setStory', part: m.part, story: null});
    assert.equal(v.hdr, null);
    assert.equal(v.d, d);
    assert.equal(v.typing.d, d);
    assert.equal(m.facade.gone, true);
    d.undo();
    assert.equal(v.hdr, null, 'not entered again by itself (P7.5)');
    assert.ok(enterMode(v, {kind: 'hdr', i: 1}), 'can enter again');
  });

  it('an undo of a body step leaves the mode, the caret in the body',
    () => {
      const d = doc(), v = viewOf(d);
      v.sel = v.typing.type(v.sel, 'B');
      enterMode(v, {kind: 'hdr', i: 1});
      d.undo();
      assert.equal(v.hdr, null);
      assert.equal(v.sel.head.id, d.doc.sections[0].blocks[0].id);
    });

  it('a story step undone outside the mode: the window goes into that'
    + ' story (P7.5), never reading its path as a body one', () => {
    const d = doc(), v = viewOf(d);
    enterMode(v, {kind: 'hdr', i: 2});
    const st = v.d.doc.sections[0].blocks[0];
    v.sel = v.typing.type(S.caret(v.L.docStart()), 'Z');
    leaveMode(v);
    const sel = v.sel;
    d.undo();
    assert.ok(v.hdr && v.hdr.part === H, 'the mode');
    assert.equal(v.hdr.i, 1, 'the first page from the caret\'s (page'
      + ' 1: titlePg, none) that shows it');
    assert.deepEqual(v.sel, S.caret({id: st.id, off: 0}));
    leaveMode(v);
    assert.deepEqual(v.sel, sel, 'the body\'s selection kept');
  });
});

describe('the mode\'s geometry and labels (./HdrView)', () => {
  it('editLayout is layoutStory\'s layout moved down by top', async () => {
    const doc = await readDocx(await withHeaders(p(r('b')),
      {default: p(r('Head one')) + p(r('Head two'))}));
    const st = doc.stories.get(H), ctx = {doc, metrics: tm()};
    const a = layoutStory(st, 500, ctx), b = editLayout(st, 500, ctx, 37);
    assert.notEqual(b.L, a.L, 'its own');
    const near = (x, y) => Math.abs(x - y) < 1e-6;
    assert.ok(near(b.h, a.h), 'the same height');
    assert.ok(near(b.y - a.y, 37), 'moved by top');
    assert.equal(b.x, a.x);
    const pos = {id: st.blocks[0].id, off: 3};
    const ca = a.L.caretRect(pos, 'down');
    b.L.place = PlaceShift(b.L, 100, 1000, 4);
    const cb = b.L.caretRect(pos, 'down');
    assert.ok(near(cb.x - ca.x, 100) && near(cb.y - ca.y, 1037),
      JSON.stringify({ca, cb}));
    const h = b.L.hitTest(cb.x + 1, cb.y + 1);
    assert.deepEqual(h.pos, pos, 'a hit at the moved caret');
    assert.equal(b.L.place.pageOf(), 4);
  });

  it('labels: type, kind, section, Same as previous', () => {
    const one = {sections: [{props: {extra: []}}], rawSettings: null};
    const bare2 = {sections: [{props: {extra: []}},
      {props: {extra: [], titlePg: true}}], rawSettings: null};
    // (section 2 has its own first-page header reference)
    const two = {...bare2, sections: [bare2.sections[0], {props:
      withRef(bare2.sections[1].props, 'hdr', 'first', 'rIdX',
        docMap(bare2))}]};
    const ref = (type, s) => ({part: 'x', type, s});
    const pg = (o) => ({s: 0, first: false, num: 2, header: null,
      footer: null, ...o});
    assert.deepEqual(labelOf(one, pg({header: ref('default', 0)}),
      'hdr'), {text: 'Header', linked: false});
    assert.deepEqual(labelOf(one, pg({footer: ref('even', 0)}), 'ftr'),
      {text: 'Even page footer', linked: false});
    assert.deepEqual(labelOf(two, pg({s: 1, first: true, header:
      ref('first', 1)}), 'hdr'), {text:
      'First page header - Section 2', linked: false});
    assert.deepEqual(labelOf(two, pg({s: 1, header: ref('default', 0)}),
      'hdr'), {text: 'Header - Section 2', linked: true});
    assert.deepEqual(labelOf(two, pg({s: 1, first: true}), 'ftr'),
      {text: 'First page footer - Section 2', linked: true},
      'none at all: the type from the section, linked');
    // M2: an EMPTY first or even header (no reference anywhere) in a
    // later section is linked, as Link to previous is ticked
    assert.deepEqual(labelOf(bare2, pg({s: 1, first: true, header:
      {part: null, type: 'first', s: 1}}), 'hdr'), {text:
      'First page header - Section 2', linked: true});
    assert.deepEqual(labelOf(two, pg({s: 1, first: true, header:
      {part: null, type: 'first', s: 1, kept: 'word/h.xml'}}), 'hdr'),
    {text: 'First page header - Section 2', linked: false},
    'its own reference (a part kept as bytes): not linked');
  });
});

describe('a note through the facade (Batch E2)', () => {
  const PIC = p('<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.' +
    'openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
    '<wp:extent cx="1" cy="1"/><wp:docPr id="70" name="P"/>' +
    '</wp:inline></w:drawing></w:r>');
  let nd, nbytes;
  before(async () => {
    nd = freeze(await noteDoc(p(r('body one') + mark(1)) +
      p(r('body two') + mark(2)) + PIC,
    {1: noteP('first note'), 2: noteP('second') + p(r('more'))}));
    nbytes = await write(nd);
  });
  const K1 = {note: {kind: 'footnote', id: 1}};
  const K2 = {note: {kind: 'footnote', id: 2}};
  const nfresh = () => new Document({...nd, sections:
    nd.sections.map((s) => ({...s, blocks: s.blocks.slice()}))});
  const note = (d, id = 1) => d.doc.notes.footnotes.get(id);
  const at = (d, k, off, id = 1) => S.caret({id: note(d, id).blocks[k].id,
    off});

  /** Run cmd on note 1's facade; only that note changed; undo back to
   *  the document as read (bytes too). */
  async function onlyNote(cmd, check, opts = {}) {
    const d = nfresh(), f = facadeOf(d, K1, 0), t = new Typing(f);
    const body = d.doc.sections, two = note(d, 2), n1 = note(d);
    const read = d.doc.notes.read, stories = d.doc.stories;
    const out = cmd(f, t, d);
    assert.ok(out !== null && out !== false, 'the command did something');
    assert.ok(deepEqual(d.doc.sections, nd.sections), 'body as read');
    assert.equal(d.doc.sections, body);
    if (opts.rels) {
      assert.equal(note(d, 2).blocks, two.blocks, 'only its rels');
    } else assert.equal(note(d, 2), two, 'the other note shared');
    assert.notEqual(note(d), n1, 'a new Note');
    assert.equal(d.doc.notes.read, read, 'the snapshot untouched');
    assert.equal(d.doc.stories, stories);
    if (check) await check(d, f, out);
    await lintAfter(d.doc, 'after the command');
    while (d.canUndo) d.undo();
    assert.ok(deepEqual(d.doc.notes, nd.notes), 'undone');
    assert.deepEqual(await write(d.doc), nbytes, 'bytes as read');
    return d;
  }

  it('is memoised per (Document, note); its doc is the note', () => {
    const d = nfresh(), f = facadeOf(d, K1, 0);
    assert.equal(facadeOf(d, {note: {kind: 'footnote', id: 1}}, 0), f);
    assert.notEqual(facadeOf(d, K2, 0), f);
    assert.notEqual(facadeOf(d, {note: {kind: 'endnote', id: 1}}), f);
    assert.notEqual(facadeOf(d, 'word/footnotes.xml'), f,
      'a part name is a story, not a note');
    const v = f.doc;
    assert.equal(f.doc, v);
    assert.equal(v.sections.length, 1);
    assert.equal(v.sections[0].blocks, note(d).blocks);
    assert.equal(v.sections[0].props, d.doc.sections[0].props);
    assert.equal(v.meta.mainPart, 'word/footnotes.xml');
    assert.equal(v.meta.documentRoot, d.doc.notes.root.footnotes);
    assert.equal(v.styles, d.doc.styles);
    assert.deepEqual(v.rels, []);
    const body = v.stories.get(d.doc.meta.mainPart);
    assert.deepEqual(body.blocks, d.doc.sections[0].blocks,
      'the body seen by the scanners as a story');
    assert.equal(f.gone, false);
    assert.equal(f.story, note(d));
    assert.deepEqual(findBlock(v, note(d).blocks[0].id).at, [0, 0]);
    assert.equal(findBlock(v, note(d).blocks[0].id).story, null);
    for (const bad of [{note: {kind: '__proto__', id: 1}},
      {note: {kind: 'footnote', id: '1'}}, {note: null},
      {note: {kind: 'footnote', id: 1.5}}, [], {},
      JSON.parse('{"__proto__": {"kind": "footnote", "id": 1}}')])
      assert.throws(() => facadeOf(d, bad, 0), RangeError);
  });

  it('typing', () => onlyNote((f, t, d) =>
    t.type(at(d, 0, 2), 'X'), (d) => {
    assert.equal(note(d).blocks[0].text, '\ufffc Xfirst note');
    assert.equal(d.undoDepth, 1);
  }));

  it('Enter', () => onlyNote((f, t, d) =>
    run('enter', f, t, at(d, 0, 7)), (d) => {
    assert.deepEqual(note(d).blocks.map((b) => b.text),
      ['\ufffc first', ' note']);
  }));

  it('bold (FormatSet toggle)', () => onlyNote((f, t, d) => toggle(f, t,
    S.select({id: note(d).blocks[0].id, off: 2},
      {id: note(d).blocks[0].id, off: 7}), 'bold', EMPTY), (d) => {
    assert.ok(note(d).blocks[0].runs.some((x) => x.rPr.b === true &&
      x.start === 2 && x.end === 7));
  }));

  it('a list (ListMake)', () => onlyNote((f, t, d) => toggleList(f, t,
    at(d, 0, 3), {kind: 'bullet'}, EMPTY), async (d) => {
    assert.ok(note(d).blocks[0].pPr.numPr, 'a list item');
    assert.ok(d.doc.numbering, 'its numbering in the document');
    const z = await readZip(await write(d.doc));
    assert.match(dec(z.get('word/footnotes.xml')),
      /<w:numId w:val="\d+"\/>/);
  }, {rels: true}));

  it('a picture and a numbering relationship in ONE setDocPart: each ' +
    'to its place; one undo takes both back', () => {
    const d = nfresh(), f = facadeOf(d, K1, 0);
    const docRels = d.doc.rels, cur = f.doc.rels, depth = d.undoDepth;
    const img = {id: 'rId90', type: REL('image'),
      target: 'media/image9.png'};
    const num = {id: 'rId91', type: REL('numbering'),
      target: 'numbering.xml'};
    f.apply({op: 'setDocPart', key: 'rels', value: [...cur, img, num]});
    assert.equal(d.undoDepth, depth + 1, 'one step');
    assert.ok(note(d).rels.includes(img), 'the picture: the part\'s');
    assert.ok(!note(d).rels.some((x) => /numbering$/.test(x.type)));
    assert.ok(d.doc.rels.some((x) => /numbering$/.test(x.type) &&
      x.target === 'numbering.xml'), 'the numbering: the main part\'s');
    assert.ok(!d.doc.rels.some((x) => /image$/.test(x.type)));
    d.undo();
    assert.equal(d.doc.rels, docRels);
    assert.deepEqual(note(d).rels ?? [], cur);
  });

  it('a document-level relationship the main part has: no op, no ' +
    'step', () => {
    const d = nfresh(), f = facadeOf(d, K1, 0);
    const has = d.doc.rels.find((x) => /footnotes$/.test(x.type));
    assert.ok(has);
    const depth = d.undoDepth, notes = d.doc.notes, rels = d.doc.rels;
    f.apply({op: 'setDocPart', key: 'rels', value: [...f.doc.rels,
      {id: 'rId77', type: has.type, target: has.target}]});
    assert.equal(d.undoDepth, depth, 'no empty step');
    assert.equal(d.doc.notes, notes);
    assert.equal(d.doc.rels, rels);
  });

  it('a relationship id the part and the document both use: the ' +
    'document-level one gets an id free in document.xml.rels',
  async () => {
    const d = nfresh(), f = facadeOf(d, K1, 0);
    const link = {id: 'rId5', type: REL('hyperlink'),
      target: 'http://example.com/', mode: 'External'};
    d.apply({op: 'setNoteRels', kind: 'footnote', rels: [link]});
    const extra = [1, 2, 3, 4, 5].map((k) => ({id: 'rId' + k,
      type: REL('customXml'),
      target: '../customXml/item' + k + '.xml'}))
      .filter((x) => !d.doc.rels.some((y) => y.id === x.id));
    d.apply({op: 'setDocPart', key: 'rels', value: [...d.doc.rels,
      ...extra]});
    const before = new Set(d.doc.rels.map((x) => x.id));
    assert.ok(before.has('rId5'));
    f.apply({op: 'setDocPart', key: 'rels', value: [link,
      {id: 'rId6', type: REL('numbering'), target: 'numbering.xml'}]});
    const got = d.doc.rels.find((x) => /numbering$/.test(x.type));
    assert.ok(got && !before.has(got.id), got && got.id);
    assert.equal(new Set(d.doc.rels.map((x) => x.id)).size,
      d.doc.rels.length, 'no id twice');
    assert.deepEqual(note(d).rels, [link]);
  });

  it('find looks in the note only', () => {
    const d = nfresh(), f = facadeOf(d, K1, 0);
    const m = search(f.doc, null, 'note');
    assert.deepEqual(m.at, [0, 0]);
    assert.equal(search(f.doc, null, 'body'), null);
    assert.equal(search(f.doc, null, 'more'), null, 'not note 2');
  });

  it('a picture: related from the notes part, for every note; its ' +
    'docPr id past the body\'s', () => onlyNote((f, t, d) => insertPic(
    f, at(d, 0, 0), {bytes: pngBytes(4, 2)}), async (d) => {
    const rels = note(d).rels;
    const rel = rels.find((x) => /image$/.test(x.type));
    assert.equal(rel.target, 'media/image1.png');
    for (const n of d.doc.notes.footnotes.values())
      assert.equal(n.rels, rels, 'one rels for the part');
    assert.ok(!d.doc.rels.some((x) => /image$/.test(x.type)));
    assert.ok(usedDocPrIds(d.doc).ids.has(71), 'seen from the body');
    const z = await readZip(await write(d.doc));
    assert.match(dec(z.get('word/_rels/footnotes.xml.rels')),
      /Target="media\/image1.png"/);
    assert.match(dec(z.get('word/footnotes.xml')), /docPr id="71"/);
  }, {rels: true}));

  it('undo and redo are the real Document\'s; ids unique across the ' +
    'body and the notes', () => {
    const d = nfresh(), f = facadeOf(d, K1, 0), t = new Typing(f);
    t.type(at(d, 0, 2), 'A');
    run('enter', f, t, at(d, 0, 3));
    const all = ids(d.doc);
    assert.equal(new Set(all).size, all.length, 'no id twice');
    for (const b of note(d).blocks) assert.ok(all.includes(b.id),
      'the scanners see the note');
    assert.equal(d.undoDepth, 2);
    f.undo();
    assert.equal(note(d).blocks[0].text, '\ufffc Afirst note');
    d.undo();
    assert.ok(deepEqual(note(d), nd.notes.footnotes.get(1)));
    f.redo();
    assert.equal(note(d).blocks[0].text, '\ufffc Afirst note');
    const used = new Set(ids(d.doc));
    d.apply({op: 'insertBlock', at: [0, 0], block: newPara('x')});
    assert.ok(!used.has(d.doc.sections[0].blocks[0].id));
  });

  it('refused: section ops, a note in a note, another story; a note ' +
    'gone', () => {
    const d = nfresh(), f = facadeOf(d, K1, 0);
    const s = d.doc.sections[0];
    for (const op of [{op: 'splitSection', at: [0, 1]},
      {op: 'mergeSection', at: 0},
      {op: 'setSection', at: 0, raw: s.raw, props: s.props}]) {
      assert.throws(() => f.apply(op), RangeError, op.op);
      assert.throws(() => f.apply({op: 'compound', ops: [op]}),
        RangeError);
    }
    for (const id of ['footnote', 'endnote', 'pageBreak',
      'sectionNext']) {
      assert.equal(f.refuses(id), true, id);
      assert.equal(run(id, f, new Typing(f), at(d, 0, 2)), null, id);
    }
    for (const story of [K2, 'word/footnotes.xml',
      {note: {kind: 'endnote', id: 1}}])
      assert.throws(() => f.apply({op: 'replaceText', story,
        block: [0, 0], at: 0, del: 0, ins: 'x'}), RangeError);
    assert.equal(d.undoDepth, 0);
    assert.ok(deepEqual(d.doc.notes, nd.notes));
    d.apply({op: 'removeNote', kind: 'footnote', id: 1});
    assert.equal(f.gone, true);
    assert.deepEqual(f.doc.sections[0].blocks, [], 'an empty view');
    assert.throws(() => f.apply({op: 'replaceText', block: [0, 0],
      at: 0, del: 0, ins: 'y'}), RangeError);
    d.undo();
    assert.equal(f.gone, false);
  });
});

describe('ids chosen in a story or a note are the document\'s ' +
  '(Batch E2)', () => {
  const FN = (id) => ({note: {kind: 'footnote', id}});
  /** A body, a header and three footnotes (note 3 an endnote too). */
  async function many() {
    const doc = await noteDoc(p(r('body one') + mark(1)) +
      p(r('body two') + mark(2)) + p(r('body three') + mark(3)),
    {1: noteP('first note'), 2: noteP('second note'),
      3: noteP('third note')});
    return new Document(doc);
  }
  const first = (v) => v.doc.sections[0].blocks[0].id;
  /** Every bookmarkStart id in the document (body, stories, notes). */
  function bmIds(d) {
    const out = [];
    const look = (bs) => {
      for (const b of bs) for (const x of Object.values(b.inlines ||
        {})) {
        if (x && x.node && /bookmarkStart$/.test(x.node.name))
          out.push(x.node.attrs.find(([k]) => k === 'w:id')[1]);
      }
    };
    for (const s of d.doc.sections) look(s.blocks);
    for (const st of d.doc.stories.values()) look(st.blocks);
    for (const m of [d.doc.notes.footnotes, d.doc.notes.endnotes])
      for (const n of m.values()) look(n.blocks);
    return out;
  }
  const bm = (v, name) => {
    const res = addBookmark(v, new Typing(v), S.caret({id: first(v),
      off: 2}), name);
    assert.ok(!res.error, name + ': ' + res.error);
  };

  it('bookmarks: note to note, body after a note, a note after the ' +
    'body: no id twice', async () => {
    const d = await many();
    bm(facadeOf(d, FN(1)), 'InNote1');
    bm(facadeOf(d, FN(2)), 'InNote2');
    bm(d, 'InBody');
    bm(facadeOf(d, FN(3)), 'InNote3');
    const got = bmIds(d);
    assert.equal(got.length, 4);
    assert.equal(new Set(got).size, 4, got.join());
  });

  it('bookmarks: a header and a note; each facade sees the body\'s, ' +
    'the headers\' and the other notes\'', async () => {
    const doc = await readDocx(await withHeaders(p(r('body') +
      mark(1)), {default: p(r('Head one'))}, {parts: {
      'word/footnotes.xml': '<?xml version="1.0"?><w:footnotes ' +
        'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/' +
        '2006/main">' + '<w:footnote w:id="1">' + noteP('n1') +
        '</w:footnote><w:footnote w:id="2">' + noteP('n2') +
        '</w:footnote></w:footnotes>'}, docRels: [['rIdN1',
      'http://schemas.openxmlformats.org/officeDocument/2006/' +
      'relationships/footnotes', 'footnotes.xml']]}));
    const d = new Document(doc);
    assert.equal(d.doc.notes.footnotes.size, 2);
    bm(facadeOf(d, H, 0), 'InHead');
    bm(facadeOf(d, FN(1)), 'InNote1');
    bm(facadeOf(d, H, 0), 'InHead2');
    bm(facadeOf(d, FN(2)), 'InNote2');
    bm(d, 'InBody');
    const got = bmIds(d);
    assert.equal(got.length, 5);
    assert.equal(new Set(got).size, 5, got.join());
  });

  it('pictures: note 1, note 2 and the body take three docPr ids',
    async () => {
      const d = await many();
      const pic = (v) => insertPic(v, S.caret({id: first(v), off: 0}),
        {bytes: pngBytes(4, 2)});
      pic(facadeOf(d, FN(1)));
      pic(facadeOf(d, FN(2)));
      pic(d);
      pic(facadeOf(d, FN(3)));
      const z = dec((await readZip(await write(d.doc)))
        .get('word/footnotes.xml')) + dec((await readZip(
        await write(d.doc))).get('word/document.xml'));
      const got = [...z.matchAll(/docPr id="(\d+)"/g)].map((m) => m[1]);
      assert.equal(got.length, 4);
      assert.equal(new Set(got).size, 4, got.join());
      await lintAfter(d.doc, 'pictures in notes');
    });

  it('a mark with an absurd id (past MAX_NOTE_ID) is passed over',
    async () => {
      const big = String(MAX_NOTE_ID + 5);
      const doc = await noteDoc(p(r('a') + mark(1) + r('b') +
        mark(big)), {1: noteP('one')});
      const x = Object.values(doc.sections[0].blocks[0].inlines)
        .filter((y) => y.kind === 'noteRef');
      assert.equal(x.length, 2, 'both read as marks');
      assert.equal(x[1].id, +big);
      assert.equal(nextNoteId(doc, 'footnote'), 2);
    });

  it('a bookmark in a table nested in a table in a note: the body\'s ' +
    'next bookmark takes a higher id', async () => {
    const tc = (x) => '<w:tc>' + x + '</w:tc>';
    const tbl = (x) => '<w:tbl><w:tblPr><w:tblW w:w="0" ' +
      'w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol ' +
      'w:w="2000"/></w:tblGrid>' +
      '<w:tr>' + tc(x) + '</w:tr></w:tbl>';
    const deep = p(r('in') + '<w:bookmarkStart w:id="41" ' +
      'w:name="Deep"/><w:bookmarkEnd w:id="41"/>');
    const doc = await noteDoc(p(r('body') + mark(1)), {1: noteP('n') +
      tbl(tbl(deep) + p(r('c'))) + p(r('after'))});
    const d = new Document(doc);
    assert.equal(d.doc.notes.footnotes.get(1).blocks[1].type, 'tbl');
    bm(d, 'InBody');
    const got = bmIds(d);
    assert.ok(got.includes('42'), got.join());
    const n = d.doc.notes.footnotes.get(1);
    const inner = n.blocks[1].rows[0].cells[0].blocks[0];
    assert.equal(inner.type, 'tbl', 'nested');
  });

  it('a note id at the 9-digit limit: no id past it', async () => {
    const d = await many();
    const MAX = 999999999;
    d.apply({op: 'addNote', kind: 'footnote', id: MAX,
      note: newNote(d.doc, 'footnote', MAX, [newPara('x')])});
    assert.throws(() => nextNoteId(d.doc, 'footnote'), RangeError);
    assert.equal(nextNoteId(d.doc, 'endnote'), 1);
  });
});

describe('a story\'s or note\'s document-level relationships go to ' +
  'the main part (Batch E2 fix)', () => {
  /** A list made through facade f of Document d (no numbering part):
   *  written, read back, the relationship in document.xml.rels. */
  async function listIn(d, f, part, b0, bytes0) {
    const p0 = f.doc.sections[0].blocks[0];
    toggleList(f, new Typing(f), S.caret({id: p0.id, off: 1}),
      {kind: 'bullet'}, EMPTY);
    const bytes = await write(d.doc);
    const z = await readZip(bytes);
    const docRels = dec(z.get('word/_rels/document.xml.rels'));
    assert.match(docRels, /relationships\/numbering"/);
    const own = z.get(part.replace('word/', 'word/_rels/') + '.rels');
    assert.ok(!own || !/numbering/.test(dec(own)),
      'not in the part\'s own .rels');
    const back = await readDocx(bytes);
    assert.ok(back.numbering, 'numbering read back');
    assert.ok(back.meta.numberingPart);
    const num = b0(back).pPr.numPr;
    assert.ok(num && Number.isInteger(num.numId) && num.numId > 0,
      JSON.stringify(num));
    assert.ok(back.numbering.nums.has(num.numId), 'its numId defined');
    await lintAfter(d.doc, 'a list in ' + part);
    while (d.canUndo) d.undo();
    assert.deepEqual(await write(d.doc), bytes0, 'undo: as before');
  }

  it('a header: write, read back, the list is numbered', async () => {
    const d = fresh();
    await listIn(d, facadeOf(d, H, 0), H,
      (back) => back.stories.get(H).blocks[0], bytes0);
  });

  it('a footnote: the same', async () => {
    const doc = await noteDoc(p(r('body') + mark(1)),
      {1: noteP('first note')});
    const d = new Document(doc), b = await write(doc);
    await listIn(d, facadeOf(d, {note: {kind: 'footnote', id: 1}}),
      'word/footnotes.xml',
      (back) => back.notes.footnotes.get(1).blocks[0], b);
  });

  it('a document with numbering already: no second relationship',
    async () => {
      const d = fresh();
      toggleList(d, new Typing(d), S.caret({id: d.doc.sections[0]
        .blocks[0].id, off: 1}), {kind: 'bullet'}, EMPTY);
      const n0 = d.doc.rels.length, num0 = d.doc.meta.numberingPart;
      const f = facadeOf(d, H, 0);
      toggleList(f, new Typing(f), caretIn(d, 0, 1),
        {kind: 'number'}, EMPTY);
      assert.equal(d.doc.rels.length, n0);
      assert.equal(d.doc.meta.numberingPart, num0);
      assert.ok(!(hdr(d).rels || []).some((x) =>
        /numbering$/.test(x.type)));
      const back = await readDocx(await write(d.doc));
      assert.ok(back.stories.get(H).blocks[0].pPr.numPr);
    });
});
