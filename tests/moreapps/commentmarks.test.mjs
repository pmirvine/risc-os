// The comment marks in the body (Batch F1): w:commentRangeStart,
// w:commentRangeEnd and the w:commentReference run child read as
// modelled inlines (cmtStart, cmtEnd, cmtRef) in body paragraphs,
// tables and nested tables, every other place keeping today's raw
// inline; written back byte-identically; drawn, counted and keyed
// exactly as the raw marks were; ./CommentMarks marks; block ids of
// comments in ./Walk forEachId; ./MovePairs pairing the modelled
// ranges.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {OBJ, newPara, reserveIds, nextId}
  from '../../tools/moreapps/!Letters/Model';
import {checkPara, checkBlock}
  from '../../tools/moreapps/!Letters/ModelCheck';
import {unseen, unseenAt, onlyUnseen}
  from '../../tools/moreapps/!Letters/Kinds';
import {tokens} from '../../tools/moreapps/!Letters/LineTokens';
import {facts} from '../../tools/moreapps/!Letters/Info';
import {inlineKind} from '../../tools/moreapps/!Letters/BookmarkIndex';
import {clean} from '../../tools/moreapps/!Letters/ClipClean';
import {afterSpace} from '../../tools/moreapps/!Letters/AutoList';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {marks, stats} from '../../tools/moreapps/!Letters/CommentMarks';
import {ids, scan} from '../../tools/moreapps/!Letters/Walk';
import {checkIds} from '../../tools/moreapps/!Letters/OpsUtil';
import {widen} from '../../tools/moreapps/!Letters/MovePairs';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {p, r, REL} from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {commentDoc, commentParts, cs, ce, cr, range}
  from './comment-fixtures.mjs';
import {commentFiles} from './comment-oracle.mjs';
import {CORPUS, SKIP_CORPUS} from './roundtrip-lib.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const dec = (b) => new TextDecoder().decode(b);
const para = (doc, k = 0) => doc.sections[0].blocks[k];
const docXml = async (doc) => dec((await readZip(await writeDocx(doc,
  {date: DATE}))).get('word/document.xml'));
const RAW = {commentMarks: false};
const kindsOf = (b) => Object.keys(b.inlines).sort((x, y) => x - y)
  .map((k) => b.inlines[k].kind);
const tbl = (rows) => '<w:tbl><w:tblPr>' +
  '<w:tblW w:w="0" w:type="auto"/>' +
  '</w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>' +
  rows.map((c) => `<w:tr><w:tc>${c}</w:tc></w:tr>`).join('') +
  '</w:tbl>';
const ONE = p(r('a') + range(1, r('bc')) + r('d'));

describe('reading the marks', () => {
  it('in a body paragraph: start and end at level p, the reference ' +
    'in its run', async () => {
    const doc = await commentDoc(ONE, {1: 'one'});
    const b = para(doc);
    assert.equal(b.text, 'a' + OBJ + 'bc' + OBJ + OBJ + 'd');
    assert.deepEqual(kindsOf(b), ['cmtStart', 'cmtEnd', 'cmtRef']);
    const [s, e, x] = [b.inlines[1], b.inlines[4], b.inlines[5]];
    assert.deepEqual([s.level, s.id, s.node.name],
      ['p', 1, 'w:commentRangeStart']);
    assert.deepEqual([e.level, e.id, e.node.name],
      ['p', 1, 'w:commentRangeEnd']);
    assert.deepEqual([x.level, x.id, x.node.name],
      ['r', 1, 'w:commentReference']);
    assert.equal(b.runs.find((u) => u.start === 5).rStyle,
      'CommentReference');
    checkPara(b);
  });

  it('in a table cell and a nested table', async () => {
    const inner = tbl([p(range(2, r('deep')))]);
    const doc = await commentDoc(tbl([p(range(1, r('x'))),
      inner + p()]) + p(), {1: 'one', 2: 'two'});
    const t = para(doc);
    assert.deepEqual(kindsOf(t.rows[0].cells[0].blocks[0]),
      ['cmtStart', 'cmtEnd', 'cmtRef']);
    const n = t.rows[1].cells[0].blocks[0];
    assert.equal(n.type, 'tbl');
    assert.deepEqual(kindsOf(n.rows[0].cells[0].blocks[0]),
      ['cmtStart', 'cmtEnd', 'cmtRef']);
  });

  it('elsewhere they stay raw: a header, a footnote, a link, a ' +
    'content control, a table\'s own marks', async () => {
    const c = commentParts({1: 'one', 2: 'two', 3: 'three'});
    const FN = '<?xml version="1.0"?><w:footnotes xmlns:w="' +
      'http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:footnote w:id="1">' + p(range(3, r('n'))) + '</w:footnote>' +
      '</w:footnotes>';
    const body = p('<w:hyperlink w:anchor="x">' + range(1, r('l')) +
      '</w:hyperlink>') + p('<w:sdt><w:sdtContent>' +
      range(2, r('s')) + '</w:sdtContent></w:sdt>') +
      '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>' +
      '<w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>' + cs(2) +
      '<w:tr><w:tc>' + p(r('c')) + '</w:tc></w:tr>' + ce(2) +
      '</w:tbl>' + p(r('n') + '<w:r><w:footnoteReference w:id="1"/>' +
      '</w:r>');
    const doc = await readDocx(await withHeaders(body,
      {default: p(range(3, r('h')))}, {parts: {...c.parts,
        'word/footnotes.xml': FN}, docRels: [...c.docRels,
        ['rIdN1', REL('footnotes'), 'footnotes.xml']]}));
    const bs = doc.sections[0].blocks;
    assert.deepEqual(kindsOf(bs[0]), ['raw']);
    assert.deepEqual(kindsOf(bs[1]), ['raw']);
    assert.equal(bs[2].type, 'tbl');
    assert.deepEqual(kindsOf(bs[2].rows[0].cells[0].blocks[0]), []);
    const [st] = doc.stories.values();
    assert.deepEqual(kindsOf(st.blocks[0]), ['raw', 'raw', 'raw']);
    const note = doc.notes.footnotes.get(1);
    assert.deepEqual(kindsOf(note.blocks[0]), ['raw', 'raw', 'raw']);
  });

  it('an id that is not a plain whole number, two ids, children or ' +
    'a mark kept off by the read option: raw', async () => {
    for (const odd of ['007', '-1', 'x', '', '2147483648', '1.5']) {
      const doc = await commentDoc(p(`<w:commentRangeStart w:id=` +
        `"${odd}"/>` + r('a') + `<w:r><w:commentReference w:id=` +
        `"${odd}"/></w:r>`), {1: 'one'});
      assert.deepEqual(kindsOf(para(doc)), ['raw', 'raw'], odd);
    }
    const two = await commentDoc(p('<w:commentRangeStart w:id="1" ' +
      'xmlns:x="urn:x" x:id="2"/>' + '<w:commentRangeEnd w:id="1">' +
      '<w:t>a</w:t></w:commentRangeEnd>'), {1: 'one'});
    assert.deepEqual(kindsOf(para(two)), ['raw', 'raw']);
    const off = await commentDoc(ONE, {1: 'one'}, {read: RAW});
    assert.deepEqual(kindsOf(para(off)), ['raw', 'raw', 'raw']);
    const big = await commentDoc(p(cs(2147483647) + r('a')), {});
    assert.equal(para(big).inlines[0].id, 2147483647);
  });
});

describe('written back as they were read', () => {
  const FIX = {
    one: ONE,
    replies: p(cs(1) + r('a') + cs(2) + r('b') + ce(1) + cr(1) +
      ce(2) + cr(2)),
    crossing: p(r('x') + cs(1) + r('a')) + p(r('b')) +
      p(r('c') + ce(1) + cr(1)),
    point: p(r('x') + cr(1) + r('y')),
    table: tbl([p(range(1, r('cell'))), p(cs(2) + r('a'))]) +
      p(r('b') + ce(2) + cr(2)),
    formatted: p('<w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t>' +
      '<w:commentReference w:id="1"/><w:t>more</w:t></w:r>'),
    prefixed: p('<w:commentRangeStart w:id="1" w:other="k"/>' +
      r('a') + '<w:commentRangeEnd w:id="1"/>'),
    missing: p(range(7, r('nobody'))),
  };
  for (const [name, body] of Object.entries(FIX)) {
    it(name + ': document.xml as with raw marks', async () => {
      const cm = {1: 'one', 2: {text: 'two', parent: 1}};
      const a = await commentDoc(body, cm);
      const b = await commentDoc(body, cm, {read: RAW});
      assert.equal(await docXml(a), await docXml(b));
      scan(a, (x) => checkBlock(x));
    });
  }

  it('a modelled mark with no node is refused by the model check',
    async () => {
      const b = para(await commentDoc(ONE, {1: 'one'}));
      const bad = (x) => ({...b, inlines: {...b.inlines, 1: x}});
      const s = b.inlines[1];
      for (const x of [{...s, node: undefined}, {...s, level: 'r'},
        {...s, id: 2}, {...s, id: -1}, {...s, id: '1'},
        {...s, kind: 'cmtEnd'}, {...b.inlines[5], level: 'p'}]) {
        assert.throws(() => checkPara(bad(x)), RangeError);
      }
      checkPara(b);
    });
});

describe('drawn, counted and keyed as the raw marks were', () => {
  const BODIES = [ONE, p(cs(1) + cs(2) + r('a b') + ce(1) + cr(1) +
    ce(2) + cr(2)), p(cs(1) + ce(1) + cr(1)), p(cr(1)),
  p(cs(1) + r('* '))];
  it('the same tokens, unseen offsets and empty-for-the-keys',
    async () => {
      for (const body of BODIES) {
        const a = await commentDoc(body, {1: 'one', 2: 'two'});
        const b = await commentDoc(body, {1: 'one', 2: 'two'},
          {read: RAW});
        const pa = para(a), pb = para(b);
        const strip = (ts) => ts.map(({t, text, kind, from, to, shown,
          f}) => ({t, text, kind, from, to, shown, px: f && f.px}));
        assert.deepEqual(strip(tokens(pa, a.styles, new Map())),
          strip(tokens(pb, b.styles, new Map())), body);
        for (let k = 0; k <= pa.text.length; k++) {
          assert.equal(unseenAt(pa, k), unseenAt(pb, k),
            body + ' ' + k);
        }
        assert.equal(onlyUnseen(pa), onlyUnseen(pb));
        for (const k of Object.keys(pa.inlines)) {
          assert.equal(inlineKind(pa.inlines[k]),
            inlineKind(pb.inlines[k]));
        }
        assert.deepEqual(facts(a).kinds, facts(b).kinds);
      }
    });

  it('a reference draws nothing, still counts as a comment item',
    async () => {
      const doc = await commentDoc(p(r('a') + cr(1) + r('b')),
        {1: 'one'});
      const ts = tokens(para(doc), doc.styles, new Map());
      assert.deepEqual(ts.map((x) => x.t), ['w', 'z', 'w']);
      assert.ok(facts(doc).kinds.some(([k, n]) => k === 'comment' &&
        n === 1), JSON.stringify(facts(doc).kinds));
    });

  it('unseen by kind too (a mark Task 4 makes)', () => {
    const node = {name: 'w:commentRangeStart', attrs: [['w:id', '1']],
      children: []};
    assert.equal(unseen({kind: 'cmtStart', level: 'p', id: 1, node}),
      true);
    assert.equal(unseen({kind: 'cmtEnd', level: 'p', id: 1,
      node: {...node, name: 'w:commentRangeEnd'}}), true);
    assert.equal(unseen({kind: 'cmtRef', level: 'r', id: 1,
      node: {...node, name: 'w:commentReference'}}), true);
  });

  it('AutoList passes over a comment start before the marker',
    async () => {
      const d = new Document(await commentDoc(p(cs(1) + ce(1) +
        r('* ')), {1: 'one'}));
      const b = para(d.doc);
      const sel = afterSpace(d, new Typing(d), {anchor: {id: b.id,
        off: 4}, head: {id: b.id, off: 4}});
      assert.ok(sel, 'converted');
      assert.equal(para(d.doc).text, OBJ + OBJ);
    });

  it('a copy in the same document drops the marks (as before)',
    async () => {
      const doc = await commentDoc(ONE, {1: 'one'});
      const [b] = clean([para(doc)], doc, {sameDoc: true});
      assert.equal(b.text, 'abcd');
      const [x] = clean([para(doc)], doc, {});
      assert.equal(x.text, 'abcd');
    });
});

describe('CommentMarks marks', () => {
  it('each comment\'s first start, end and reference: path and ' +
    'offset; tables too; a point comment', async () => {
    const doc = await commentDoc(p(r('a') + cs(1) + r('b')) +
      tbl([p(r('c') + ce(1) + cr(1)), p(cr(2))]) + p(cs(1)), {});
    const m = marks(doc);
    assert.deepEqual(m.get(1), {start: {path: [0, 0], off: 1},
      end: {path: [0, 1, 0, 0, 0], off: 1},
      ref: {path: [0, 1, 0, 0, 0], off: 2}});
    assert.deepEqual(m.get(2), {start: null, end: null,
      ref: {path: [0, 1, 1, 0, 0], off: 0}});
    assert.equal(m.size, 2);
  });

  it('memoised: the same Map until an op; a paragraph scanned once',
    async () => {
      const d = new Document(await commentDoc(ONE + p(r('x') + cr(3)) +
        p(range(2, r('y'))), {1: 'one', 2: 'two', 3: 'three'}));
      const m = marks(d.doc);
      assert.equal(marks(d.doc), m);
      const n0 = stats.paras;
      d.apply({op: 'replaceText', block: [0, 1], at: 0, del: 0,
        ins: 'z'});
      const m2 = marks(d.doc);
      assert.notEqual(m2, m);
      assert.deepEqual(m2.get(1), m.get(1));
      assert.deepEqual(m2.get(2), m.get(2));
      assert.equal(m2.get(3).ref.off, m.get(3).ref.off + 1);
      assert.equal(stats.paras - n0, 1, 'only the changed paragraph');
    });

  it('a document with no marks: an empty Map', async () => {
    assert.equal(marks(await commentDoc(p(r('x')), {})).size, 0);
    assert.equal(marks({sections: []}).size, 0);
  });
});

describe('block ids: the comments\' are the document\'s', () => {
  it('every id once across body, stories, notes and comments',
    async () => {
      const doc = await commentDoc(ONE + tbl([p(r('c'))]) + p(),
        {1: 'one', 2: 'two'});
      const all = ids(doc);
      const cids = [...doc.comments.map.values()].flatMap((c) =>
        c.blocks.map((b) => b.id));
      for (const id of cids)
        assert.ok(all.includes(id), 'listed ' + id);
      assert.equal(new Set(all).size, all.length, 'unique');
    });

  it('reserveIds moves past a comment\'s id; checkIds refuses it',
    async () => {
      const doc = await commentDoc(ONE, {1: 'one'});
      const c = doc.comments.map.get(1);
      const big = {...c, blocks: [{...c.blocks[0], id: 9e8}]};
      doc.comments = {...doc.comments, map: new Map([[1, big]])};
      reserveIds(doc);
      assert.ok(nextId() > 9e8);
      assert.throws(() => checkIds(doc, [{...newPara('x'), id: 9e8}]),
        /already in use/);
    });
});

describe('MovePairs: a modelled comment range is kept whole', () => {
  it('a move of one end takes the other', async () => {
    const doc = await commentDoc(p(cs(1) + r('a')) + p(r('b')) +
      p(r('c') + ce(1) + cr(1)) + p(r('d')), {1: 'one'});
    const bl = doc.sections[0].blocks;
    assert.deepEqual(widen(bl, 0, 1), [0, 3]);
    assert.deepEqual(widen(bl, 2, 3), [0, 3]);
    assert.deepEqual(widen(bl, 3, 4), [3, 4]);
  });
});

const HAVE = existsSync(CORPUS);

describe('the corpus', {skip: HAVE ? false : SKIP_CORPUS}, () => {
  it('the comment files: document.xml as with raw marks; the model ' +
    'checks', async () => {
    const files = await commentFiles();
    let n = 0, modelled = 0;
    const fails = [];
    for (const {file, path} of files) {
      const bytes = readFileSync(path);
      let a, b;
      try {
        a = await readDocx(bytes);
        b = await readDocx(bytes, RAW);
      } catch (e) {
        continue;
      }
      n++;
      try {
        scan(a, (x) => {
          checkBlock(x);
          if (x.type !== 'p') return;
          for (const v of Object.values(x.inlines)) {
            if (/^cmt/.test(v.kind)) modelled++;
          }
        });
        if (await docXml(a) !== await docXml(b))
          fails.push(file + ': document.xml differs');
      } catch (e) {
        fails.push(file + ': ' + e.message.slice(0, 200));
      }
    }
    console.log(`# comment marks corpus: ${n} files, ${modelled} ` +
      `modelled marks, ${fails.length} failures`);
    for (const x of fails) console.log('# FAIL ' + x);
    assert.deepEqual(fails, []);
    assert.ok(n > 0 && modelled > 0, 'marks modelled: ' + modelled);
  });
});
