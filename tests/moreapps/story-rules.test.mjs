// The story rules of the P6 fix wave (Batch D, D9, D12, D14):
// - I1 a story's .rels is its own: setStory refuses a Story whose
//   relsPart is another part's .rels (a copy {...old, part: new}),
//   and StoryWrite relsOut ignores such a relsPart (the new part's
//   own .rels written from `rels`); D14's "Link to previous: off"
//   copy gives a clean package whose hyperlink r:id resolves;
// - I3 a story keeps at least one block and ends with a paragraph
//   (the cell rule, ./TblCheck checkTail): ops that would empty it or
//   leave a table last are refused (RangeError, doc unchanged), and
//   a story read so may stay so (undo works); setStory refuses such
//   a new Story; StoryWrite writes one empty w:p for empty blocks;
// - M3 content types repaired for parts a story's .rels reaches;
// - M4 checkStory: kind agrees with the root, relsPart, bytes, orig
//   and prolog of the right types.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {apply} from '../../tools/moreapps/!Letters/Ops';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {docScope} from '../../tools/moreapps/!Letters/WriteBody';
import {freeName, relsOut, writeStory}
  from '../../tools/moreapps/!Letters/StoryWrite';
import {readStory} from '../../tools/moreapps/!Letters/StoryRead';
import {withRef} from '../../tools/moreapps/!Letters/SectRefs';
import {checkStory} from '../../tools/moreapps/!Letters/ModelCheck';
import {addRel} from '../../tools/moreapps/!Letters/DocParts';
import {newPara, nextId, sameStories}
  from '../../tools/moreapps/!Letters/Model';
import {p, r, REL, relsXml} from './build-docx.mjs';
import {withHeaders, freeze} from './story-fixtures.mjs';
import {lintAfter} from './lint-after.mjs';

const H1 = 'word/header1.xml', F1 = 'word/footer1.xml';
const H1R = 'word/_rels/header1.xml.rels';
const dec = (b) => new TextDecoder().decode(b);
const LINK = '<w:p><w:hyperlink r:id="rLnk"><w:r><w:t>link</w:t>' +
  '</w:r></w:hyperlink></w:p>';
const tc = (t) => '<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/>' +
  `</w:tcPr>${p(r(t))}</w:tc>`;
const TBL = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>' +
  '<w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>' +
  `<w:tr>${tc('a')}</w:tr></w:tbl>`;

let linked; // a header with a hyperlink (its own .rels)
let mixed;  // header: Head one, Head two, a table, an empty paragraph
let empty;  // header read empty; footer ending with a table

before(async () => {
  linked = freeze(await readDocx(await withHeaders(p(r('body')),
    {default: {hdr: LINK, ftr: p(r('Foot'))}},
    {parts: {[H1R]: relsXml([['rLnk', REL('hyperlink'),
      'http://example.com/', 'External']])}})));
  mixed = freeze(await readDocx(await withHeaders(p(r('body')),
    {default: {hdr: p(r('Head one')) + p(r('Head two')) + TBL + p(''),
      ftr: p(r('Foot'))}})));
  empty = freeze(await readDocx(await withHeaders(p(r('body')),
    {default: {hdr: '', ftr: p(r('Foot')) + TBL}})));
});

/** A doc over `doc` whose body arrays ops may change. */
const fresh = (doc) => ({...doc, sections: doc.sections.map((s) =>
  ({...s, blocks: s.blocks.slice()}))});
const reId = (b) => ({...b, id: nextId()});

/** Assert op is refused and changes nothing. */
function refused(doc, op, what) {
  const d = fresh(doc);
  const m0 = d.stories;
  assert.throws(() => apply(d, op), RangeError, what);
  assert.equal(d.stories, m0, what + ': stories unchanged');
}

describe('I1: a copied story gets its own .rels', () => {
  it('setStory refuses a Story whose relsPart is another part\'s', () => {
    const d = fresh(linked);
    const old = d.stories.get(H1);
    assert.equal(old.relsPart, H1R);
    const name = freeName(d, 'hdr');
    const copy = {...old, part: name, blocks: old.blocks.map(reId),
      bytes: null, orig: []};
    refused(linked, {op: 'setStory', part: name, story: copy},
      'foreign relsPart');
    // its own name (any case) or null is accepted
    for (const relsPart of [null, 'word/_rels/' + name.slice(5) +
      '.rels', 'WORD/_rels/' + name.slice(5).toUpperCase() + '.rels']) {
      const d2 = fresh(linked);
      apply(d2, {op: 'setStory', part: name,
        story: {...copy, relsPart}});
      assert.ok(d2.stories.has(name), String(relsPart));
    }
  });

  it('relsOut ignores a foreign relsPart', () => {
    const old = linked.stories.get(H1);
    const name = 'word/header9.xml';
    const got = relsOut({...old, part: name, bytes: null, orig: []},
      linked.parts);
    assert.ok(got, 'a .rels is written');
    assert.equal(got[0], 'word/_rels/header9.xml.rels');
    assert.match(dec(got[1]), /Id="rLnk"/);
  });

  it('a copy written without the op layer: lint clean', async () => {
    const d = fresh(linked);
    const old = d.stories.get(H1);
    const name = freeName(d, 'hdr');
    const copy = {...old, part: name, blocks: old.blocks.map(reId),
      bytes: null, orig: []};
    const {rels, id} = addRel(d.rels, {kind: 'header',
      target: name.slice(5)});
    const s = d.sections[0];
    const doc = {...d, rels, stories: new Map([...d.stories,
      [name, copy]]), sections: [{...s, props: withRef(s.props, 'hdr',
      'first', id, docScope(d).map)}]};
    const {zip} = await lintAfter(doc, 'copy, relsPart kept');
    assert.match(dec(zip.get('word/_rels/header2.xml.rels')),
      /Id="rLnk"/);
  });

  it('D14 "Link to previous: off": one undo step, lint clean, the ' +
    'hyperlink resolves', async () => {
    const d = new Document(fresh(linked));
    const map = docScope(d.doc).map;
    d.atomic(() => {
      const doc = d.doc;
      const old = doc.stories.get(H1);
      const name = freeName(doc, 'hdr');
      d.apply({op: 'setStory', part: name, story: {...old, part: name,
        blocks: old.blocks.map(reId), relsPart: null, bytes: null,
        orig: []}});
      const {rels, id} = addRel(doc.rels, {kind: 'header',
        target: name.slice(5)});
      d.apply({op: 'setDocPart', key: 'rels', value: rels});
      const s = doc.sections[0];
      d.apply({op: 'setSection', at: 0, raw: s.raw,
        props: withRef(s.props, 'hdr', 'first', id, map)});
    });
    assert.equal(d.undoDepth, 1);
    const {zip, bytes} = await lintAfter(d.doc, 'link to previous off');
    assert.match(dec(zip.get('word/header2.xml')), /r:id="rLnk"/);
    assert.match(dec(zip.get('word/_rels/header2.xml.rels')),
      /Id="rLnk"[^>]*TargetMode="External"/);
    const back = await readDocx(bytes);
    assert.equal(back.stories.get('word/header2.xml').rels[0].id,
      'rLnk');
    assert.ok(d.undo());
    assert.ok(sameStories(d.doc.stories, linked.stories));
  });
});

describe('I3: a story keeps a block and ends with a paragraph', () => {
  const ST = H1;
  it('removing every block is refused', () => {
    refused(mixed, {op: 'removeBlocks', story: ST, at: [0, 0],
      count: 4}, 'removeBlocks all');
    refused(mixed, {op: 'removeBlock', story: F1, at: [0, 0]},
      'removeBlock of the only block');
    refused(mixed, {op: 'removeBlocks', story: F1, at: [0, 0],
      count: 1}, 'removeBlocks of the only block');
  });

  it('leaving a table last is refused', () => {
    refused(mixed, {op: 'removeBlock', story: ST, at: [0, 3]},
      'removeBlock after the table');
    refused(mixed, {op: 'removeBlocks', story: ST, at: [0, 3],
      count: 1}, 'removeBlocks after the table');
    const tbl = mixed.stories.get(ST).blocks[2];
    const t2 = {...tbl, id: nextId(), rows: tbl.rows.map((row) => ({
      ...row, cells: row.cells.map((c) => ({...c,
        blocks: c.blocks.map(reId)}))}))};
    refused(mixed, {op: 'insertBlock', story: ST, at: [0, 4],
      block: t2}, 'insertBlock a table at the end');
    refused(mixed, {op: 'insertBlocks', story: ST, at: [0, 4],
      blocks: [newPara('x'), t2]}, 'insertBlocks ending in a table');
    refused(mixed, {op: 'restoreBlock', story: ST, block: [0, 3],
      snapshot: t2}, 'restoreBlock: a table in the last place');
  });

  it('the same ops elsewhere are accepted and undone', () => {
    const d = fresh(mixed);
    const inv = apply(d, {op: 'removeBlocks', story: ST, at: [0, 2],
      count: 2});
    assert.deepEqual(d.stories.get(ST).blocks.map((b) => b.text),
      ['Head one', 'Head two']);
    apply(d, inv);
    assert.ok(sameStories(d.stories, mixed.stories));
    const inv2 = apply(d, {op: 'removeBlocks', story: ST, at: [0, 0],
      count: 3});
    assert.equal(d.stories.get(ST).blocks.length, 1);
    apply(d, inv2);
    assert.ok(sameStories(d.stories, mixed.stories));
  });

  it('a story read empty or ending with a table may stay so', () => {
    const d = fresh(empty);
    assert.equal(d.stories.get(H1).blocks.length, 0);
    const inv = apply(d, {op: 'insertBlock', story: H1, at: [0, 0],
      block: newPara('typed')});
    apply(d, inv); // undo: empty again, as read
    assert.equal(d.stories.get(H1).blocks.length, 0);
    const f = d.stories.get(F1);
    assert.equal(f.blocks[f.blocks.length - 1].type, 'tbl');
    const inv2 = apply(d, {op: 'insertBlock', story: F1, at: [0, 2],
      block: newPara('after')});
    apply(d, inv2); // undo: the table last again, as read
    assert.ok(sameStories(d.stories, empty.stories));
  });

  it('setStory refuses a new Story empty or ending with a table', () => {
    const name = 'word/header5.xml';
    const st = (blocks) => ({part: name, kind: 'hdr',
      root: {name: 'w:hdr', attrs: []}, prolog: null, blocks,
      rels: null, relsPart: null, orig: [], bytes: null});
    refused(mixed, {op: 'setStory', part: name, story: st([])},
      'empty');
    const tbl = mixed.stories.get(H1).blocks[2];
    const t2 = {...tbl, id: nextId(), rows: tbl.rows.map((row) => ({
      ...row, cells: row.cells.map((c) => ({...c,
        blocks: c.blocks.map(reId)}))}))};
    refused(mixed, {op: 'setStory', part: name,
      story: st([newPara('x'), t2])}, 'table last');
    refused(mixed, {op: 'setStory', part: H1,
      story: {...mixed.stories.get(H1), blocks: []}}, 'emptied');
    // the as-read empty story is put back by undo of a remove
    const d = fresh(empty);
    const inv = apply(d, {op: 'setStory', part: H1, story: null});
    apply(d, inv);
    assert.ok(sameStories(d.stories, empty.stories));
  });

  it('StoryWrite writes one empty w:p for empty blocks', async () => {
    const s = mixed.stories.get(H1);
    const map = docScope(mixed).map;
    const out = writeStory({...s, blocks: [], bytes: null}, map);
    const back = readStory(H1, out, map, null);
    assert.equal(back.blocks.length, 1);
    assert.equal(back.blocks[0].type, 'p');
    assert.equal(back.blocks[0].text, '');
    // read empty and untouched: its very bytes
    const e = empty.stories.get(H1);
    assert.equal(writeStory(e, map), e.bytes);
  });
});

describe('M3: content types for parts a story reaches', () => {
  it('a part reached by a story .rels typed generically is repaired',
    async () => {
      const d = fresh(linked);
      const old = d.stories.get(H1);
      const theme = 'word/theme/theme9.xml';
      const parts = new Map(d.parts).set(theme, new TextEncoder()
        .encode('<?xml version="1.0"?><a:theme xmlns:a="http://' +
          'schemas.openxmlformats.org/drawingml/2006/main" ' +
          'name="t"/>'));
      const rels = [...old.rels, {id: 'rTh', type: REL('theme'),
        target: 'theme/theme9.xml', attrs: [['Id', 'rTh'],
          ['Type', REL('theme')], ['Target', 'theme/theme9.xml']]}];
      const doc = {...d, parts, meta: {...d.meta,
        zipOrder: [...d.meta.zipOrder, theme]},
        stories: new Map(d.stories).set(H1, {...old, rels})};
      const {zip} = await lintAfter(doc, 'theme via a header');
      assert.match(dec(zip.get('[Content_Types].xml')),
        /PartName="\/word\/theme\/theme9.xml" ContentType="application\/vnd.openxmlformats-officedocument.theme\+xml"/);
    });
});

describe('M4: checkStory', () => {
  it('refuses a malformed Story (RangeError)', () => {
    const s = mixed.stories.get(H1);
    checkStory(s);
    checkStory({...s, relsPart: null, bytes: null, prolog: null});
    const bad = {
      'kind not the root': {...s, kind: 'ftr'},
      'root ftr, kind hdr': {...s, root: {...s.root, name: 'w:ftr'}},
      'relsPart a number': {...s, relsPart: 7},
      'bytes a string': {...s, bytes: 'xx'},
      'orig not blocks': {...s, orig: [1, 2]},
      'orig null entry': {...s, orig: [null]},
      'prolog a string': {...s, prolog: 'x'},
      'prolog without before': {...s, prolog: {decl: null}},
    };
    for (const [what, st] of Object.entries(bad)) {
      assert.throws(() => checkStory(st), RangeError, what);
    }
  });
});
