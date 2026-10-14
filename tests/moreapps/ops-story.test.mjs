// Ops addressing a header or footer story (Batch D P6.4, D12, R8):
// every op takes `story` (a part name; absent or null: the body),
// resolves [0, i, ...] against that story's blocks, replaces
// doc.stories with a new Map holding a new Story (copy-on-write),
// and gives an inverse carrying the same story. Fail closed: an
// unknown story, a section index other than 0 in a story, a story on
// a section op, a setDocPart or a compound: RangeError, doc unchanged.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {apply} from '../../tools/moreapps/!Letters/Ops';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {newPara, nextId, deepEqual, sameStories}
  from '../../tools/moreapps/!Letters/Model';
import {forEachBlock, mapBlocks, at as walkAt}
  from '../../tools/moreapps/!Letters/Walk';
import {p, r} from './build-docx.mjs';
import {withHeaders, freeze} from './story-fixtures.mjs';

const H = 'word/header1.xml';
const F = 'word/footer1.xml';
const DATE = new Date(2024, 4, 6, 7, 8, 10);
const write = (doc) => writeDocx(doc, {date: DATE});
const tc = (t) => '<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/>' +
  `</w:tcPr>${p(r(t))}</w:tc>`;
const TBL = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>' +
  '<w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/>' +
  `</w:tblGrid><w:tr>${tc('a')}${tc('b')}</w:tr></w:tbl>`;
const R = (o = {}) => ({...o, extra: []});

let opened;      // frozen: the document as read
let openedBytes; // what writing it gives

before(async () => {
  opened = freeze(await readDocx(await withHeaders(
    p(r('body one')) + p(r('body two')),
    {default: {hdr: p(r('Head one')) + p(r('Head two')) + TBL + p(''),
      ftr: p(r('Foot'))}})));
  openedBytes = await write(opened);
});

/** A doc over `opened` whose body arrays may be changed (ops write
 *  a section's own blocks array); every object in it stays frozen,
 *  stories included. */
const fresh = () => ({...opened, sections: opened.sections.map((s) =>
  ({...s, blocks: s.blocks.slice()}))});
const hdr = (d) => d.stories.get(H);
const texts = (bs) => bs.map((b) => (b.type === 'p' ? b.text : '#'));

/** Apply op to a fresh doc; check copy-on-write and the inverse. */
function roundTrip(op, check) {
  const d = fresh();
  const m0 = d.stories;
  const vals = [...m0.values()];
  const body = d.sections[0].blocks.slice();
  const inv = apply(d, op);
  assert.notEqual(d.stories, m0, 'a new Map');
  assert.deepEqual([...m0.values()], vals, 'the old Map unchanged');
  assert.notEqual(hdr(d), m0.get(H), 'a new Story');
  assert.equal(d.stories.get(F), m0.get(F), 'the footer shared');
  assert.deepEqual([...d.stories.keys()], [...m0.keys()], 'order');
  assert.ok(d.sections[0].blocks.every((b, i) => b === body[i]),
    'the body untouched');
  if (check) check(d, inv);
  const leaves = inv.op === 'compound' ? inv.ops : [inv];
  for (const o of leaves) assert.equal(o.story, H, 'inverse story');
  const again = apply(d, inv);
  assert.ok(sameStories(d.stories, opened.stories), 'undone');
  assert.ok(deepEqual(d.sections, opened.sections), 'body as read');
  apply(d, again);
  return d;
}

describe('ops in a header story', () => {
  it('replaceText', () => {
    roundTrip({op: 'replaceText', story: H, block: [0, 0], at: 5,
      del: 3, ins: 'ONE'}, (d, inv) => {
      assert.equal(hdr(d).blocks[0].text, 'Head ONE');
      assert.equal(inv.op, 'spliceText');
    });
  });
  it('replaceText in a cell of the header table', () => {
    roundTrip({op: 'replaceText', story: H, block: [0, 2, 0, 1, 0],
      at: 1, del: 0, ins: '!'}, (d) => {
      assert.equal(walkAt({sections: [{blocks: hdr(d).blocks}]},
        [0, 2, 0, 1, 0]).text, 'b!');
      assert.notEqual(hdr(d).blocks[2], hdr(opened).blocks[2],
        'the table copied, not changed');
    });
  });
  it('splitBlock and mergeBlock', () => {
    roundTrip({op: 'splitBlock', story: H, block: [0, 1], at: 4},
      (d) => assert.deepEqual(texts(hdr(d).blocks),
        ['Head one', 'Head', ' two', '#', '']));
    roundTrip({op: 'mergeBlock', story: H, block: [0, 0]},
      (d) => assert.deepEqual(texts(hdr(d).blocks),
        ['Head oneHead two', '#', '']));
  });
  it('insertBlocks and removeBlocks', () => {
    roundTrip({op: 'insertBlocks', story: H, at: [0, 4],
      blocks: [newPara('x'), newPara('y')]}, (d, inv) => {
      assert.deepEqual(texts(hdr(d).blocks),
        ['Head one', 'Head two', '#', '', 'x', 'y']);
      assert.deepEqual(inv, {op: 'removeBlocks', story: H, at: [0, 4],
        count: 2});
    });
    roundTrip({op: 'removeBlocks', story: H, at: [0, 0], count: 2});
    roundTrip({op: 'insertBlock', story: H, at: [0, 2, 0, 0, 0],
      block: newPara('in a cell')});
    roundTrip({op: 'removeBlock', story: H, at: [0, 1]});
  });
  it('restoreBlock of a table (a row added, fresh ids)', () => {
    const t = hdr(opened).blocks[2];
    const row = {...t.rows[0], cells: t.rows[0].cells.map((c) =>
      ({...c, blocks: mapBlocks(c.blocks, (q) =>
        ({...q, extraP: [], id: nextId()}))}))};
    roundTrip({op: 'restoreBlock', story: H, block: [0, 2],
      snapshot: {...t, rows: [t.rows[0], row]}}, (d) => {
      assert.equal(hdr(d).blocks[2].rows.length, 2);
      assert.equal(hdr(d).blocks[2].rows[0], t.rows[0], 'row shared');
    });
  });
  it('restoreBlock of a table reusing a body id: refused', () => {
    const t = hdr(opened).blocks[2];
    const used = opened.sections[0].blocks[0].id;
    const row = {...t.rows[0], cells: t.rows[0].cells.map((c, k) =>
      ({...c, blocks: mapBlocks(c.blocks, (q) =>
        ({...q, extraP: [], id: k ? nextId() : used}))}))};
    refused({op: 'restoreBlock', story: H, block: [0, 2],
      snapshot: {...t, rows: [t.rows[0], row]}});
  });
  it('setProps', () => {
    roundTrip({op: 'setProps', story: H, block: [0, 0],
      pPr: {jc: 'center'}, rPr: {b: true}, range: {start: 0, end: 4}},
    (d) => {
      const q = hdr(d).blocks[0];
      assert.equal(q.pPr.jc, 'center');
      assert.equal(q.runs[0].rPr.b, true);
    });
  });
  it('a footer story too', () => {
    const d = fresh();
    const inv = apply(d, {op: 'replaceText', story: F, block: [0, 0],
      at: 0, del: 0, ins: '>'});
    assert.equal(d.stories.get(F).blocks[0].text, '>Foot');
    assert.equal(d.stories.get(H), opened.stories.get(H));
    assert.equal(inv.story, F);
  });
  it('story null is the body; a body op has no story', () => {
    const d = fresh();
    const inv = apply(d, {op: 'replaceText', story: null,
      block: [0, 0], at: 0, del: 0, ins: '>'});
    assert.equal(d.sections[0].blocks[0].text, '>body one');
    assert.equal(d.stories, opened.stories, 'the Map kept');
    assert.ok(!('story' in inv));
  });
});

/** op is refused: RangeError, and the doc as it was. */
function refused(op, d = fresh()) {
  const m0 = d.stories;
  const body = d.sections.map((s) => s.blocks.slice());
  assert.throws(() => apply(d, op), RangeError);
  assert.equal(d.stories, m0, 'the Map kept');
  assert.ok(sameStories(m0, opened.stories), 'stories as read');
  assert.deepEqual(d.sections.map((s) => s.blocks), body, 'body');
}

describe('fail closed', () => {
  const rt = {op: 'replaceText', block: [0, 0], at: 0, del: 0, ins: 'x'};
  it('an unknown story', () => {
    refused({...rt, story: 'word/header9.xml'});
    refused({...rt, story: '__proto__'});
    refused({...rt, story: 'word/document.xml'});
  });
  it('a story that is not a string', () => {
    for (const story of [0, 1, true, {}, [H]]) refused({...rt, story});
  });
  it('no stories Map: a story is unknown', () => {
    const d = {...fresh(), stories: undefined};
    assert.throws(() => apply(d, {...rt, story: H}), RangeError);
  });
  it('a section index other than 0 in a story', () => {
    refused({...rt, story: H, block: [1, 0]});
    refused({op: 'insertBlock', story: H, at: [1, 0],
      block: newPara('x')});
    refused({op: 'insertBlocks', story: H, at: [-1, 0],
      blocks: [newPara('x')]});
  });
  it('past the end of the story', () => {
    refused({...rt, story: H, block: [0, 4]});
    refused({op: 'removeBlocks', story: H, at: [0, 3], count: 2});
  });
  it('section ops, setDocPart and compound refuse a story', () => {
    const sec = opened.sections[0];
    refused({op: 'splitSection', story: H, at: [0, 0],
      props: R(), raw: null});
    refused({op: 'mergeSection', story: H, at: 0});
    refused({op: 'setSection', story: H, at: 0, props: R(), raw: null});
    refused({op: 'setSection', story: H, at: 0, props: sec.props,
      raw: sec.raw});
    refused({op: 'setDocPart', story: H, key: 'settings', value: null});
    refused({op: 'compound', story: H, ops: [{...rt, story: H}]});
  });
  it('a compound of a story op and a refused op: nothing changes', () => {
    refused({op: 'compound', ops: [{...rt, story: H},
      {...rt, block: [0, 9]}]});
  });
  it('an id the body uses, put in a story (and the reverse)', () => {
    const used = opened.sections[0].blocks[1].id;
    refused({op: 'insertBlock', story: H, at: [0, 0],
      block: {...newPara('x'), id: used}});
    const hid = hdr(opened).blocks[0].id;
    refused({op: 'insertBlock', at: [0, 0],
      block: {...newPara('x'), id: hid}});
  });
});

describe('Document: one history for the body and the header', () => {
  it('undo all gives the opened model and its very bytes', async () => {
    const d = new Document(fresh());
    d.group(() => {
      d.apply({op: 'replaceText', story: H, block: [0, 0], at: 0,
        del: 4, ins: 'Top'});
      d.apply({op: 'splitBlock', block: [0, 0], at: 4});
    });
    d.apply({op: 'mergeBlock', story: H, block: [0, 0]});
    assert.equal(hdr(d.doc).blocks[0].text, 'Top oneHead two');
    while (d.undo());
    assert.ok(sameStories(d.doc.stories, opened.stories));
    assert.ok(deepEqual(d.doc.sections, opened.sections));
    assert.deepEqual(await write(d.doc), openedBytes);
  });
});

// ---- random interleaved sequences (Risk 4) ---------------------------

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gen(rnd) {
  const int = (n) => Math.floor(rnd() * n);
  const pick = (a) => a[int(a.length)];
  const word = () => pick(['', 'a', 'xy', ' z ', 'Word']);
  /** Every path in blocks (and some one past a container's end). */
  const paths = (blocks) => {
    const all = [[0, blocks.length]];
    forEachBlock({sections: [{blocks}]}, (b, at) => void all.push(at));
    return all;
  };
  const tableOp = (blocks, story) => {
    const k = blocks.findIndex((b) => b.type === 'tbl');
    if (k < 0) return {op: 'insertBlock', at: [0, int(blocks.length +
      1)], block: newPara(word())};
    const t = blocks[k];
    const rows = t.rows.slice();
    const j = int(rows.length);
    if (rows.length > 1 && rnd() < 0.4) rows.splice(j, 1);
    else {
      rows.splice(j, 0, {...rows[j], cells: rows[j].cells.map((c) =>
        ({...c, blocks: mapBlocks(c.blocks, (q) => ({...q, extraP: [],
          id: rnd() < 0.05 ? q.id : nextId()}))}))});
    }
    return {op: 'restoreBlock', story, block: [0, k],
      snapshot: {...t, rows}};
  };
  return (doc) => {
    const inHdr = rnd() < 0.6;
    const story = inHdr ? H : undefined;
    const blocks = inHdr ? doc.stories.get(H).blocks
      : doc.sections[0].blocks;
    const at = pick(paths(blocks));
    const b = walkAt({sections: [{blocks}]}, at);
    const len = b && b.type === 'p' ? b.text.length : 0;
    const off = () => int(len + 1) + (rnd() < 0.05 ? 1 : 0);
    const x = rnd();
    let op;
    if (x < 0.3) {
      const a = off();
      op = {op: 'replaceText', block: at, at: a,
        del: int(Math.max(1, len - a + 1)), ins: word()};
      if (rnd() < 0.2) op.rPr = R({i: true});
    } else if (x < 0.42) {
      op = {op: 'setProps', block: at, rPr: pick([{b: true}, {b: null}]),
        pPr: pick([{jc: 'right'}, {jc: null}])};
    } else if (x < 0.52) op = {op: 'splitBlock', block: at, at: off()};
    else if (x < 0.6) op = {op: 'mergeBlock', block: at};
    else if (x < 0.68) {
      op = {op: 'insertBlocks', at, blocks: [newPara(word()),
        newPara(word())]};
    } else if (x < 0.76) op = {op: 'removeBlocks', at, count: 1 + int(2)};
    else if (x < 0.84) op = {op: 'removeBlock', at};
    else if (x < 0.94) op = tableOp(blocks, story);
    else if (x < 0.97) {
      op = {op: 'replaceText', block: [1, 0], at: 0, del: 0, ins: 'x'};
    } else op = {op: 'setSection', at: 0, props: R(), raw: null};
    if (story) op.story = story;
    else delete op.story;
    return op;
  };
}

describe('property: random ops in a header and the body', () => {
  it('500 sequences: undo all gives the model and bytes as read',
    async () => {
      const BASE = 20261012;
      let ok = 0, inHdr = 0;
      const vals = [...opened.stories.values()];
      for (let k = 0; k < 500; k++) {
        const rnd = mulberry32(BASE + k);
        const next = gen(rnd);
        const d = new Document(fresh());
        const log = [];
        try {
          const n = 1 + Math.floor(rnd() * 25);
          for (let j = 0; j < n; j++) {
            const op = next(d.doc);
            log.push(op);
            const m0 = d.doc.stories;
            const before = structuredClone(d.doc.sections);
            try {
              d.apply(op);
              ok++;
              if (op.story) inHdr++;
              if (!op.story) assert.equal(d.doc.stories, m0);
            } catch (e) {
              if (!(e instanceof RangeError)) throw e;
              assert.equal(d.doc.stories, m0, 'refused: Map kept');
              assert.ok(deepEqual(d.doc.sections, before), 'refused');
            }
          }
          const final = structuredClone(d.doc);
          while (d.undo());
          assert.ok(deepEqual(d.doc.sections, opened.sections), 'body');
          assert.ok(sameStories(d.doc.stories, opened.stories), 'stories');
          while (d.redo());
          assert.ok(deepEqual(d.doc.sections, final.sections), 'redo body');
          assert.ok(sameStories(d.doc.stories, final.stories), 'redo');
          while (d.undo());
          assert.deepEqual(await write(d.doc), openedBytes, 'bytes');
        } catch (e) {
          e.message = 'seed ' + (BASE + k) + ': ' + e.message +
            '\nops: ' + JSON.stringify(log);
          throw e;
        }
      }
      assert.deepEqual([...opened.stories.values()], vals, 'opened kept');
      assert.ok(ok > 3000, 'enough ops applied: ' + ok);
      assert.ok(inHdr > 1500, 'enough in the header: ' + inHdr);
    });
});
