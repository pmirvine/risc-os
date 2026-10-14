// The header and footer commands (Batch D P7.4, D14, PG15, PG17):
// Different first page (titlePg), Different odd and even pages
// (settings evenAndOddHeaders), Link to previous (on: the section's
// reference removed, and the story with its relationship and .rels
// when no section uses it any more; off: the inherited story copied
// to a new part with fresh ids and its relationships), Remove (the
// story emptied to one paragraph with the Header or Footer style; the
// part stays), and a header made on the FIRST edit of a page that has
// none (./HdrCmd createOnEdit through the ./StoryFacade of the
// window's mode): entering and leaving changes nothing; one letter
// typed is one undo step that makes the story, its relationship, its
// reference, its content type and the Header style (Word 2016's:
// tab stops centre 4513 and right 9026 twips). Each command is one
// undo step, undone to deep-equal (bytes too), and the written file
// lints clean after every one.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {firstPageCmd, oddEvenCmd, linkCmd, removeCmd, createOnEdit,
  styleFor} from '../../tools/moreapps/!Letters/HdrCmd';
import {builtinStyle} from '../../tools/moreapps/!Letters/StylesBuiltin';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {refsOf, storyOfRef} from '../../tools/moreapps/!Letters/SectRefs';
import {docMap} from '../../tools/moreapps/!Letters/PicRead';
import {onOffOf} from '../../tools/moreapps/!Letters/SettingsRead';
import {ids as blockIdsOf} from '../../tools/moreapps/!Letters/Walk';
import {deepEqual, sameStories} from '../../tools/moreapps/!Letters/Model';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {enterMode, leaveMode}
  from '../../tools/moreapps/!Letters/HdrEdit';
import {afterChange} from '../../tools/moreapps/!Letters/HdrStep';
import {pick, refOf} from '../../tools/moreapps/!Letters/HdrPick';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {p, r, settingsXml} from './build-docx.mjs';
import {freeze, withHeaders} from './story-fixtures.mjs';
import {wordHf, picRun, BODY} from './hf-fixtures.mjs';
import {pngBytes} from './pic-fixtures.mjs';
import {lintAfter} from './lint-after.mjs';
import {tm} from './word-docs.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const write = (doc) => writeDocx(doc, {date: DATE});
const dec = (b) => new TextDecoder().decode(b);
const H1 = 'word/header1.xml';
const PGSZ = '<w:pgSz w:w="11906" w:h="16838"/>';
/** A paragraph ending section 0 (its sectPr holding `refs`). */
const brk = (refs = '') => p(r('section one'), '<w:sectPr>' + refs +
  PGSZ + '</w:sectPr>');
const RED = pngBytes(8, 4, {rgb: [255, 0, 0]});
/** A default header with a picture, a bookmark and a content
 *  control (block-level w:sdt). */
const RICH = p(picRun('rIdP1') + '<w:bookmarkStart w:id="7" ' +
  'w:name="hb"/>' + r('Head') + '<w:bookmarkEnd w:id="7"/>') +
  '<w:sdt><w:sdtPr><w:id w:val="4242"/></w:sdtPr><w:sdtContent>' +
  p('<w:bookmarkStart w:id="8" w:name="hc"/>' + r('Page') +
    '<w:bookmarkEnd w:id="8"/>') + '</w:sdtContent></w:sdt>' +
  p(r('end'));

/** Everything a command may change, for deep-equal checks. */
const state = (doc) => ({sections: doc.sections, rels: doc.rels,
  styles: doc.styles, rawSettings: doc.rawSettings, parts: doc.parts,
  meta: doc.meta, stories: doc.stories});
const fresh = (doc) => new Document({...doc, sections: doc.sections
  .map((s) => ({...s, blocks: s.blocks.slice()}))});
const refs = (doc, s) => refsOf(doc.sections[s], docMap(doc));

/** cmd(d) is one undo step; written it lints clean; undone it gives
 *  the document as opened, bytes and all. Returns {d, zip}. */
async function oneStep(doc, cmd) {
  const d = fresh(doc), before0 = await write(d.doc);
  const was = state(d.doc);
  assert.equal(cmd(d), true, 'the command did something');
  assert.equal(d.undoDepth, 1, 'one undo step');
  const {zip, bytes} = await lintAfter(d.doc);
  assert.ok(d.undo());
  assert.ok(deepEqual(state(d.doc), was), 'undo: deep-equal');
  assert.ok(sameStories(d.doc.stories, doc.stories));
  assert.deepEqual(await write(d.doc), before0, 'undo: the same bytes');
  assert.ok(d.redo());
  assert.deepEqual(await write(d.doc), bytes, 'redo: the same bytes');
  return {d, zip};
}

let heads;    // one section, titlePg; default header + footer
let solo;     // two sections: section 1 alone has a header (+ .rels)
let shared;   // two sections both referencing header1 (RICH)
let bare;     // one section, no header or footer, a settings part
let evens;    // evenAndOddHeaders on

before(async () => {
  heads = freeze(await readDocx(await wordHf({titlePg: true,
    body: BODY(40), default: {hdr: p(r('Running head')),
      ftr: p(r('Running foot'))}})));
  solo = freeze(await readDocx(await wordHf({body: brk() + BODY(3),
    pic: RED, default: {hdr: p(picRun('rIdP1')) + p(r('Solo'))}})));
  shared = freeze(await readDocx(await wordHf({pic: RED,
    body: brk('<w:headerReference w:type="default" r:id="rIdH1"/>') +
      BODY(3), default: {hdr: RICH}})));
  bare = freeze(await readDocx(await withHeaders(BODY(30), {},
    {parts: {'word/settings.xml': settingsXml('')}})));
  evens = freeze(await readDocx(await wordHf({evenAndOdd: true,
    body: BODY(3), default: {hdr: p(r('Odd'))}})));
});

describe('the Header and Footer styles (StylesBuiltin, PG15)', () => {
  it('Word 2016\'s definitions: tab stops centre 4513, right 9026', () => {
    for (const [id, name] of [['Header', 'header'],
      ['Footer', 'footer']]) {
      const s = builtinStyle(id);
      assert.equal(s.id, id);
      assert.equal(s.name, name);
      assert.equal(s.type, 'paragraph');
      assert.equal(s.basedOn, 'Normal');
      assert.equal(s.uiPriority, 99);
      assert.equal(s.unhideWhenUsed, true);
      assert.deepEqual(s.pPr.tabs, [{val: 'center', pos: 4513},
        {val: 'right', pos: 9026}]);
      assert.deepEqual(s.pPr.spacing, {after: 0, line: 240,
        lineRule: 'auto'});
      assert.notEqual(builtinStyle(id), s, 'a new copy each time');
    }
  });

  it('styleFor: added once; a document\'s own (by name) is used', () => {
    const a = styleFor(bare, 'hdr');
    assert.equal(a.id, 'Header');
    assert.ok(a.styles.styles.has('Header'));
    assert.ok(!bare.styles.styles.has('Header'), 'not in place');
    const b = styleFor({...bare, styles: a.styles}, 'hdr');
    assert.deepEqual(b, {id: 'Header', styles: null});
    const own = {...a.styles.styles.get('Header'), id: 'MyHead'};
    const t = {...bare.styles, styles: new Map(bare.styles.styles)
      .set('MyHead', own)};
    assert.deepEqual(styleFor({...bare, styles: t}, 'hdr'),
      {id: 'MyHead', styles: null});
    assert.throws(() => styleFor(bare, 'side'), RangeError);
  });
});

describe('Different first page, Different odd and even pages', () => {
  it('first page on: titlePg, one step; again: nothing', async () => {
    const {d} = await oneStep(solo, (d) => firstPageCmd(d, 1, true));
    assert.equal(d.doc.sections[1].props.titlePg, true);
    assert.equal(firstPageCmd(d, 1, true), false);
    assert.equal(d.undoDepth, 1, 'no step for nothing');
  });

  it('first page off', async () => {
    const {d} = await oneStep(heads, (d) => firstPageCmd(d, 0, false));
    assert.notEqual(d.doc.sections[0].props.titlePg, true);
  });

  it('odd and even on and off (settings, document-wide)', async () => {
    const {d} = await oneStep(bare, (d) => oddEvenCmd(d, true));
    assert.equal(onOffOf(d.doc, 'evenAndOddHeaders'), true);
    const {d: e} = await oneStep(evens, (d) => oddEvenCmd(d, false));
    assert.equal(onOffOf(e.doc, 'evenAndOddHeaders'), false);
    assert.equal(oddEvenCmd(e, false), false);
  });

  it('refused (null, nothing changed): no settings part; bad s', () => {
    const d = fresh(solo), was = state(d.doc);
    assert.equal(oddEvenCmd(d, true), null, 'no settings part');
    for (const s of [-1, 2, 1e9, NaN, 0.5, '0', null, '__proto__'])
      assert.equal(firstPageCmd(d, s, true), null, String(s));
    assert.equal(d.undoDepth, 0);
    assert.ok(deepEqual(state(d.doc), was));
  });
});

describe('Link to previous', () => {
  it('on, the only user (PG17): part, relationship and .rels go',
    async () => {
      assert.ok(solo.stories.has(H1));
      assert.ok(solo.parts.has('word/_rels/header1.xml.rels'));
      const {d, zip} = await oneStep(solo,
        (d) => linkCmd(d, 1, 'hdr', 'default', true));
      assert.equal(refs(d.doc, 1).hdr.default, undefined);
      assert.ok(!d.doc.stories.has(H1));
      assert.ok(!d.doc.rels.some((x) => /header/.test(x.target)));
      assert.ok(!zip.has(H1), 'the part is gone');
      assert.ok(!zip.has('word/_rels/header1.xml.rels'), '.rels gone');
      const ct = dec(zip.get('[Content_Types].xml'));
      assert.ok(!ct.includes('header1'), 'its content type gone');
      assert.ok(!dec(zip.get('word/_rels/document.xml.rels'))
        .includes('header1'), 'its relationship gone');
      assert.ok(zip.has('word/media/image1.png'), 'media kept (D10)');
    });

  it('on, another section still uses it: the reference only', async () => {
    const {d} = await oneStep(shared,
      (d) => linkCmd(d, 1, 'hdr', 'default', true));
    assert.equal(refs(d.doc, 1).hdr.default, undefined);
    assert.equal(refs(d.doc, 0).hdr.default, 'rIdH1');
    assert.ok(d.doc.stories.has(H1));
  });

  it('off: the inherited story copied, fresh ids, its own .rels',
    async () => {
      const linked = fresh(shared);
      linkCmd(linked, 1, 'hdr', 'default', true);
      const base = freeze(linked.doc);
      const {d, zip} = await oneStep(base,
        (d) => linkCmd(d, 1, 'hdr', 'default', false));
      const part = storyOfRef(d.doc, refs(d.doc, 1).hdr.default);
      assert.equal(part, 'word/header2.xml');
      const a = d.doc.stories.get(H1), b = d.doc.stories.get(part);
      const txt = (x) => (x.text ?? '#' + x.type).replace(/\ufffc/g, '');
      assert.deepEqual(b.blocks.map(txt), a.blocks.map(txt),
        'the same text (the bookmark marks not copied)');
      assert.equal(b.blocks[1].type, 'opaque', 'the content control');
      assert.deepEqual(b.rels.map((x) => [x.id, x.target]),
        a.rels.map((x) => [x.id, x.target]), 'its relationships');
      // no id twice anywhere
      const all = blockIdsOf(d.doc);
      assert.equal(new Set(all).size, all.length, 'block ids');
      const xml = [...zip].filter(([n]) => /\.xml$/.test(n))
        .map(([, v]) => dec(v)).join('\n');
      const every = (re) => [...xml.matchAll(re)].map((m) => m[1]);
      const docPr = every(/<wp:docPr [^>]*\bid="(\d+)"/g);
      assert.equal(docPr.length, 2, 'two pictures');
      assert.equal(new Set(docPr).size, 2, 'docPr ids');
      const sdt = every(/<w:id w:val="(-?\d+)"/g);
      assert.equal(sdt.length, 2);
      assert.equal(new Set(sdt).size, 2, 'content control ids');
      const bm = every(/<w:bookmarkStart [^>]*w:name="([^"]*)"/g);
      assert.equal(new Set(bm).size, bm.length, 'bookmark names');
      const bmId = every(/<w:bookmarkStart [^>]*w:id="([^"]*)"/g);
      assert.equal(new Set(bmId).size, bmId.length, 'bookmark ids');
      assert.ok(zip.has('word/_rels/header2.xml.rels'), 'its .rels');
      assert.match(dec(zip.get('[Content_Types].xml')),
        /PartName="\/word\/header2\.xml"/);
      const back = await readDocx(await write(d.doc));
      const p2 = storyOfRef(back, refs(back, 1).hdr.default);
      assert.equal(back.stories.get(p2).blocks.at(-1).text, 'end');
    });

  it('off, nothing to inherit: a new empty story, Header style',
    async () => {
      const {d} = await oneStep(solo,
        (d) => linkCmd(d, 1, 'ftr', 'default', false));
      const part = storyOfRef(d.doc, refs(d.doc, 1).ftr.default);
      const st = d.doc.stories.get(part);
      assert.equal(st.kind, 'ftr');
      assert.equal(st.blocks.length, 1);
      assert.equal(st.blocks[0].text, '');
      assert.equal(st.blocks[0].pStyle, 'Footer');
      assert.ok(d.doc.styles.styles.has('Footer'));
    });

  it('nothing to do: false; section 0 and bad values: null', () => {
    const d = fresh(shared), was = state(d.doc);
    assert.equal(linkCmd(d, 1, 'hdr', 'default', false), false);
    assert.equal(linkCmd(d, 1, 'hdr', 'first', true), false);
    assert.equal(linkCmd(d, 0, 'hdr', 'default', true), null);
    for (const s of [-1, 2, NaN, 1.5, '1', null])
      assert.equal(linkCmd(d, s, 'hdr', 'default', true), null);
    assert.equal(d.undoDepth, 0);
    assert.ok(deepEqual(state(d.doc), was));
    assert.throws(() => linkCmd(d, 1, 'side', 'default', true),
      RangeError);
    assert.throws(() => linkCmd(d, 1, 'hdr', 'odd', true), RangeError);
  });
});

describe('Remove header or footer', () => {
  it('emptied to one paragraph with the style; the part stays',
    async () => {
      const {d, zip} = await oneStep(shared, (d) => removeCmd(d, H1));
      const st = d.doc.stories.get(H1);
      assert.equal(st.blocks.length, 1);
      assert.equal(st.blocks[0].text, '');
      assert.equal(st.blocks[0].pStyle, 'Header');
      assert.equal(refs(d.doc, 0).hdr.default, 'rIdH1');
      assert.ok(zip.has(H1));
      assert.equal(removeCmd(d, H1), false, 'again: nothing');
      assert.equal(removeCmd(d, 'word/nothing.xml'), null);
      assert.equal(removeCmd(d, null), null);
    });
});

describe('createOnEdit', () => {
  it('story, relationship, reference, style in one step', async () => {
    const {d, zip} = await oneStep(bare,
      (d) => typeof createOnEdit(d, 0, 'hdr', 'default') === 'string');
    const part = storyOfRef(d.doc, refs(d.doc, 0).hdr.default);
    assert.equal(part, H1);
    assert.equal(d.doc.stories.get(part).blocks[0].pStyle, 'Header');
    assert.match(dec(zip.get('[Content_Types].xml')),
      /PartName="\/word\/header1\.xml" ContentType="[^"]*header\+xml"/);
    const sx = dec(zip.get('word/styles.xml'));
    assert.match(sx, /w:styleId="Header"/);
    assert.match(sx, /<w:tab w:val="center" w:pos="4513"\/>/);
    assert.match(sx, /<w:tab w:val="right" w:pos="9026"\/>/);
    // a footer next: the Footer style, the Header one not added again
    createOnEdit(d, 0, 'ftr', 'default');
    assert.ok(d.doc.styles.styles.has('Footer'));
    assert.equal([...d.doc.styles.styles.keys()]
      .filter((k) => k === 'Header').length, 1);
  });

  it('refused (RangeError, nothing changed): the type is there', () => {
    const d = fresh(heads), was = state(d.doc);
    assert.throws(() => createOnEdit(d, 0, 'hdr', 'default'),
      RangeError);
    assert.throws(() => createOnEdit(d, 3, 'hdr', 'first'), RangeError);
    assert.equal(d.undoDepth, 0);
    assert.ok(deepEqual(state(d.doc), was));
  });
});

/** A window's view over a real Print layout (./HdrEdit's v). */
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

describe('a header made on the first edit (the window\'s mode)', () => {
  it('enter and leave, nothing typed: no step, the same bytes',
    async () => {
      for (const [doc, i, kind] of [[bare, 0, 'hdr'], [bare, 1, 'ftr'],
        [heads, 0, 'hdr'], [heads, 0, 'ftr']]) {
        const d = fresh(doc), v = viewOf(d), b0 = await write(d.doc);
        const m = enterMode(v, {kind, i});
        assert.ok(m, 'entered: ' + kind + ' ' + i);
        assert.ok(v.d === m.facade);
        const L = v.L;
        assert.equal(L.place.view, 'story');
        const st = v.d.doc.sections[0].blocks;
        const id = kind === 'hdr' ? 'Header' : 'Footer';
        assert.ok(v.d.doc.styles.styles.has(id), 'the view has it');
        assert.equal(d.doc.styles.styles.has(id), false, 'not yet');
        assert.equal(st.length, 1);
        assert.equal(st[0].pStyle, kind === 'hdr' ? 'Header' : 'Footer');
        const c = L.caretRect(L.docStart(), 'down');
        const pg = v.bodyL.place.pages.at(i);
        const rc = v.bodyL.place.sheet.rect(pg);
        if (kind === 'hdr') assert.ok(c.y >= rc.y && c.y < rc.y +
          pg.bodyTop, 'in the header band');
        else assert.ok(c.y > rc.y + pg.bodyTop, 'in the footer band');
        leaveMode(v);
        assert.equal(d.undoDepth, 0);
        assert.ok(v.typing.d === d);
        assert.deepEqual(await write(d.doc), b0, 'the same bytes');
      }
    });

  it('one letter: one step makes story, rel, reference, content type,'
    + ' style; undo takes all of it back and leaves the mode',
  async () => {
    const d = fresh(bare), v = viewOf(d), b0 = await write(d.doc);
    const was = state(d.doc);
    const m = enterMode(v, {kind: 'hdr', i: 0});
    assert.ok(!d.doc.styles.styles.has('Header'), 'not yet');
    v.sel = S.caret(v.L.docStart());
    v.sel = v.typing.type(v.sel, 'Q');
    assert.equal(d.undoDepth, 1, 'one step');
    assert.ok(v.hdr, 'still in the mode');
    const part = storyOfRef(d.doc, refs(d.doc, 0).hdr.default);
    assert.equal(part, m.part);
    const st = d.doc.stories.get(part);
    assert.equal(st.blocks[0].text, 'Q');
    assert.equal(st.blocks[0].pStyle, 'Header');
    assert.ok(d.doc.styles.styles.has('Header'));
    assert.equal(v.sel.head.id, st.blocks[0].id, 'the caret in it');
    assert.ok(v.d.doc.sections[0].blocks[0] === st.blocks[0]);
    v.sel = v.typing.type(v.sel, 'R');
    assert.equal(d.doc.stories.get(part).blocks[0].text, 'QR');
    const {zip} = await lintAfter(d.doc);
    assert.match(dec(zip.get('[Content_Types].xml')),
      /PartName="\/word\/header1\.xml"/);
    assert.match(dec(zip.get('word/styles.xml')), /w:styleId="Header"/);
    while (d.canUndo) d.undo();
    assert.ok(v.hdr === null, 'the story gone: the mode left');
    assert.ok(v.typing.d === d);
    assert.ok(deepEqual(state(d.doc), was));
    assert.deepEqual(await write(d.doc), b0);
  });

  it('page 1\'s empty first header (titlePg): made as type first',
    () => {
      const d = fresh(heads), v = viewOf(d);
      enterMode(v, {kind: 'hdr', i: 0});
      v.sel = v.typing.type(S.caret(v.L.docStart()), '\n');
      assert.equal(d.undoDepth, 1);
      const part = storyOfRef(d.doc, refs(d.doc, 0).hdr.first);
      assert.equal(d.doc.stories.get(part).blocks.length, 2);
      assert.equal(refs(d.doc, 0).hdr.default, 'rIdH1', 'kept');
    });

  it('one op applied through it alone is still one step', () => {
    const d = fresh(bare), v = viewOf(d);
    const m = enterMode(v, {kind: 'hdr', i: 0});
    m.facade.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
      ins: 'A'});
    assert.equal(d.undoDepth, 1);
    assert.equal(d.doc.stories.get(m.part).blocks[0].text, 'A');
    d.undo();
    assert.equal(d.doc.stories.size, 0, 'all of it undone');
  });

  it('a refused command in it changes nothing and makes no story',
    () => {
      const d = fresh(bare), v = viewOf(d);
      enterMode(v, {kind: 'ftr', i: 0});
      assert.equal(v.d.refuses('pageBreak'), true);
      assert.throws(() => v.d.apply({op: 'setSection', at: 0,
        props: {extra: []}}), RangeError);
      assert.equal(d.undoDepth, 0);
      assert.equal(d.doc.stories.size, 0);
    });
});

describe('undo and redo follow the story (P7.5, Review Focus 2)', () => {
  const textOf = (d, part) => d.doc.stories.get(part).blocks[0].text;

  it('undo creates and removes: the mode opens on the header, then'
    + ' leaves when the undo of its creation takes it away; redo the'
    + ' reverse', async () => {
    const d = fresh(bare), v = viewOf(d), b0 = await write(d.doc);
    const body = v.sel;
    const m = enterMode(v, {kind: 'hdr', i: 0});
    v.sel = v.typing.type(S.caret(v.L.docStart()), 'A');
    v.typing.reset();
    v.sel = v.typing.type(v.sel, 'B');
    const part = m.part;
    assert.equal(d.undoDepth, 2, 'two steps: the creation with A, B');
    leaveMode(v);
    assert.deepEqual(v.sel, body);
    d.undo();                          // (in the body)
    assert.ok(v.hdr && v.hdr.part === part, 'the mode on the header');
    assert.ok(v.d === v.hdr.facade && v.typing.d === v.hdr.facade);
    assert.equal(textOf(d, part), 'A', 'the letter gone');
    const id = d.doc.stories.get(part).blocks[0].id;
    assert.deepEqual(v.sel, S.caret({id, off: 1}), 'in the story');
    assert.equal(v.L.place.view, 'story');
    assert.deepEqual(v.hdr.bodySel, body, 'the body\'s selection kept');
    d.undo();                          // (the creation)
    assert.ok(v.hdr === null, 'the story gone: the mode left');
    assert.ok(v.d === d && v.typing.d === d, 'no stale facade');
    assert.equal(d.doc.stories.size, 0);
    assert.deepEqual(v.sel, body, 'the caret back in the body');
    assert.deepEqual(await write(d.doc), b0, 'the bytes as opened');
    d.redo();
    assert.ok(v.hdr && v.hdr.part === part, 'redo: the mode on it');
    assert.ok(!v.hdr.facade.pending && !v.hdr.facade.gone);
    assert.equal(textOf(d, part), 'A');
    assert.deepEqual(v.sel, S.caret({id, off: 1}));
    d.redo();
    assert.ok(v.hdr && v.hdr.part === part);
    assert.equal(textOf(d, part), 'AB');
    assert.deepEqual(v.sel, S.caret({id, off: 2}));
    assert.equal(v.L.caretRect(v.sel.head, 'down').y < v.bodyL.place
      .sheet.rect(v.bodyL.place.pages.at(0)).y + v.bodyL.place.pages
      .at(0).bodyTop, true, 'the caret in page 1\'s header band');
  });

  it('in the footer, an undo of a header step switches to the header,'
    + ' on the same page', () => {
    const d = fresh(heads), v = viewOf(d);
    enterMode(v, {kind: 'hdr', i: 2});
    v.sel = v.typing.type(S.caret(v.L.docStart()), 'X');
    leaveMode(v);
    const body = v.sel;
    const f = enterMode(v, {kind: 'ftr', i: 2});
    assert.ok(f && f.kind === 'ftr');
    d.undo();
    assert.ok(v.hdr && v.hdr.kind === 'hdr' && v.hdr.part === H1,
      'switched to the header');
    assert.equal(v.hdr.i, 2, 'the page it was on');
    assert.equal(textOf(d, H1), 'Running head');
    assert.equal(v.sel.head.id, d.doc.stories.get(H1).blocks[0].id);
    assert.deepEqual(v.hdr.bodySel, body, 'the body\'s selection kept');
    leaveMode(v);
    assert.deepEqual(v.sel, body);
  });

  it('in the mode, the undo of another story\'s creation leaves it',
    () => {
      const d = fresh(bare), v = viewOf(d);
      enterMode(v, {kind: 'hdr', i: 0});
      v.sel = v.typing.type(S.caret(v.L.docStart()), 'H');
      leaveMode(v);
      const ft = enterMode(v, {kind: 'ftr', i: 0});
      v.sel = v.typing.type(S.caret(v.L.docStart()), 'F');
      const fpart = ft.part;
      leaveMode(v);
      const hm = enterMode(v, {kind: 'hdr', i: 0});
      assert.ok(hm && !hm.facade.pending, 'the header made');
      d.undo();                        // (the footer's creation)
      assert.ok(!d.doc.stories.has(fpart));
      assert.ok(v.hdr === null, 'that story gone: the mode left');
      assert.ok(v.typing.d === d);
    });

  it('a redo making the story a pending mode waits for: entered afresh'
    + ' (no pending facade left)', () => {
    const d = fresh(bare), v = viewOf(d);
    const m = enterMode(v, {kind: 'hdr', i: 0});
    v.sel = v.typing.type(S.caret(v.L.docStart()), 'A');
    const part = m.part;
    leaveMode(v);
    d.undo();
    const p = enterMode(v, {kind: 'hdr', i: 0});
    assert.ok(p.facade.pending && p.part === part, 'the same name');
    d.redo();
    assert.ok(v.hdr && v.hdr !== p && v.hdr.part === part);
    assert.ok(v.hdr.facade.pending === null && v.d === v.hdr.facade);
    assert.equal(v.L.place.view, 'story', 'still in the mode');
    assert.equal(v.sel.head.id, d.doc.stories.get(part).blocks[0].id);
    assert.equal(v.sel.head.off, 1);
  });

  it('a step that names no place leaves the window where it is', () => {
    const d = fresh(heads), v = viewOf(d);
    const m = enterMode(v, {kind: 'hdr', i: 1});
    const sel = v.sel;
    d.apply({op: 'setSection', at: 0, props: {...d.doc.sections[0]
      .props, titlePg: false}});
    d.undo();
    assert.ok(v.hdr === m, 'still in the mode');
    assert.deepEqual(v.sel, sel);
  });
});

describe('a header made in a linked section edits the chain (I1)', () => {
  /** Three sections, none with a header (refs: section 1's own). */
  const three = async (refs1 = '') => freeze(await readDocx(
    await withHeaders(brk() + p(r('two'), '<w:sectPr>' + refs1 + PGSZ +
      '</w:sectPr>') + BODY(3), {}, {parts: {'word/settings.xml':
      settingsXml('')}})));

  it('createOnEdit for section 2: the reference goes to section 0, so'
    + ' every section shows it', async () => {
    const doc = await three();
    for (const type of ['default', 'first', 'even']) {
      const {d} = await oneStep(doc, (d) =>
        typeof createOnEdit(d, 2, 'hdr', type) === 'string');
      const part = storyOfRef(d.doc, refs(d.doc, 0).hdr[type]);
      assert.ok(part, type + ': section 0 has it');
      assert.equal(refs(d.doc, 2).hdr[type], undefined, 'not 2');
      assert.equal(refs(d.doc, 1).hdr[type], undefined, 'not 1');
      for (const s of [0, 1, 2]) {
        const sh = refOf(d.doc, s, type, 'hdr');
        assert.equal(sh && sh.part, part, type + ' section ' + s);
      }
    }
  });

  it('the chain stops at a section with its own reference (even one'
    + ' that reaches no story)', async () => {
    const doc = await three('<w:headerReference w:type="default" ' +
      'r:id="rIdGone"/>');
    const d = fresh(doc);
    createOnEdit(d, 2, 'hdr', 'default');
    assert.equal(refs(d.doc, 1).hdr.default, 'rIdGone', 'kept');
    assert.equal(refs(d.doc, 0).hdr.default, undefined);
    assert.ok(storyOfRef(d.doc, refs(d.doc, 2).hdr.default));
  });

  it('typed in a later section\'s header (the mode): one step, shown'
    + ' on every page, still linked; undo gives the bytes', async () => {
    const doc = await three(), d = fresh(doc), v = viewOf(d);
    const b0 = await write(d.doc), P = v.bodyL.place.pages;
    let i = 0;
    while (P.at(i).s !== 2) i++;
    const m = enterMode(v, {kind: 'hdr', i});
    v.sel = v.typing.type(S.caret(v.L.docStart()), 'H');
    assert.equal(d.undoDepth, 1);
    assert.ok(v.hdr, 'still in the mode');
    assert.equal(storyOfRef(d.doc, refs(d.doc, 0).hdr.default), m.part);
    assert.equal(refs(d.doc, 2).hdr.default, undefined, 'still linked');
    const Q = v.bodyL.place.pages;
    for (let k = 0; Q.at(k); k++) {
      if (Q.at(k).blank) continue;
      assert.equal(pick(d.doc, Q.at(k).s, Q.at(k).first, Q.at(k).num,
        'hdr').part, m.part, 'page ' + k);
    }
    while (d.canUndo) d.undo();
    assert.deepEqual(await write(d.doc), b0);
  });
});

describe('undo and redo of a header command follow the story (M1)', () => {
  const textOf = (d, part) => d.doc.stories.get(part).blocks[0].text;
  const inStory = (v, part) => !!v.hdr && v.hdr.part === part &&
    v.real.doc.stories.get(part).blocks.some((b) => b.id ===
      v.sel.head.id);

  it('Remove undone from the footer\'s mode: the window goes to the'
    + ' header put back, on the same page; redo the same', () => {
    const d = fresh(heads), v = viewOf(d);
    const f = enterMode(v, {kind: 'ftr', i: 1});
    assert.ok(f && f.kind === 'ftr');
    v.typing.command(() => removeCmd(d, H1));
    assert.equal(d.undoDepth, 1);
    d.undo();
    assert.ok(v.hdr && v.hdr.kind === 'hdr' && v.hdr.i === 1,
      'the header\'s mode, page 2');
    assert.ok(inStory(v, H1), 'the caret in the header');
    assert.equal(textOf(d, H1), 'Running head');
    leaveMode(v);
    enterMode(v, {kind: 'ftr', i: 1});
    d.redo();
    assert.ok(inStory(v, H1), 'redo: in the header emptied');
    assert.equal(textOf(d, H1), '');
  });

  it('Link to previous off undone: the copy gone, the window on the'
    + ' header the page shows again; redo: on the copy', () => {
    const linked = fresh(shared);
    linkCmd(linked, 1, 'hdr', 'default', true);
    const d = fresh(freeze(linked.doc)), v = viewOf(d);
    const P = v.bodyL.place.pages;
    let i = 0;
    while (P.at(i).s !== 1) i++;
    enterMode(v, {kind: 'hdr', i});
    assert.equal(v.hdr.part, H1);
    v.typing.command(() => linkCmd(d, 1, 'hdr', 'default', false));
    leaveMode(v);
    enterMode(v, {kind: 'hdr', i});
    const copy = v.hdr.part;
    assert.notEqual(copy, H1);
    d.undo();
    assert.ok(!d.doc.stories.has(copy));
    assert.ok(v.hdr && v.hdr.i === i && inStory(v, H1),
      'on the inherited header, the same page');
    d.redo();
    assert.ok(v.hdr && v.hdr.i === i && inStory(v, copy), 'the copy');
  });

  it('Different first page undone: the page\'s first-page header'
    + ' (one not made yet) again, not the body', () => {
    const d = fresh(heads), v = viewOf(d);
    enterMode(v, {kind: 'hdr', i: 0});
    assert.ok(v.hdr.facade.pending && v.hdr.type === 'first');
    v.typing.command(() => firstPageCmd(d, 0, false));
    leaveMode(v);
    enterMode(v, {kind: 'hdr', i: 0});
    assert.equal(v.hdr.part, H1);
    d.undo();
    assert.ok(v.hdr && v.hdr.i === 0 && v.hdr.type === 'first' &&
      v.hdr.facade.pending, 'the empty first-page header');
    assert.ok(v.d === v.hdr.facade && v.typing.d === v.hdr.facade);
    d.redo();
    assert.ok(v.hdr && v.hdr.i === 0 && inStory(v, H1));
  });

  it('from the body nothing moves', () => {
    const d = fresh(heads), v = viewOf(d), sel = v.sel;
    v.typing.command(() => removeCmd(d, H1));
    d.undo();
    assert.ok(v.hdr === null);
    assert.deepEqual(v.sel, sel);
  });
});
