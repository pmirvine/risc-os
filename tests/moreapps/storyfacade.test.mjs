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
// labelOf).
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
import {p, r} from './build-docx.mjs';
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
async function onlyStory(cmd, check) {
  const d = fresh(), f = facadeOf(d, H, 0), t = new Typing(f);
  const body = d.doc.sections, rels = d.doc.rels;
  const foot = d.doc.stories.get(F);
  const out = cmd(f, t, d);
  assert.ok(out, 'the command did something');
  assert.equal(d.doc.sections, body, 'the body untouched');
  assert.ok(deepEqual(d.doc.sections, opened.sections), 'body as read');
  assert.equal(d.doc.stories.get(F), foot, 'the footer shared');
  assert.notEqual(hdr(d), opened.stories.get(H), 'a new header');
  assert.equal(d.doc.rels, rels, 'the main relationships kept');
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
    }));

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
