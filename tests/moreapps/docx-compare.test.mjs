// The test helper assertSameDoc on big documents: a difference is
// reported quickly, with a short message saying where it is (Node's
// own deepStrictEqual message is an inspect + diff of both whole
// models, which took over a gigabyte for an 18 MB real document).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {buildDocx, documentXml, stylesXml, p, r} from './build-docx.mjs';
import {assertSameDoc, realDocxFiles, realDocxRoots}
  from './docx-compare.mjs';
import {mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync}
  from 'node:fs';
import {tmpdir, homedir} from 'node:os';
import {join} from 'node:path';

const big = (n) => buildDocx({'word/document.xml': documentXml(
  Array.from({length: n}, (_, i) => p(r('paragraph ' + i, '<w:b/>') +
    '<w:r><w:drawing><x/></w:drawing></w:r>')).join(''))},
  {broken: 'minimal: a placeholder w:drawing (<x/>) Word refuses'});

describe('assertSameDoc', () => {
  it('passes equal documents', async () => {
    const b = await big(10);
    assertSameDoc(await readDocx(b), await readDocx(b), 'same');
  });
  it('reports a difference in a big document briefly', async () => {
    const b = await big(20000);
    const want = await readDocx(b);
    const got = await readDocx(b);
    const blocks = got.sections[0].blocks;
    blocks[15000] = {...blocks[15000], text: 'changed'};
    const t0 = Date.now();
    let err = null;
    try { assertSameDoc(got, want, 'big'); } catch (e) { err = e; }
    const ms = Date.now() - t0;
    assert.ok(err instanceof assert.AssertionError, String(err));
    assert.ok(err.message.length < 2000, 'message length ' +
      err.message.length);
    assert.match(err.message, /sections\[0\]\.blocks\[15000\]\.text/);
    assert.match(err.message, /changed/);
    assert.ok(ms < 5000, ms + ' ms');
  });
});

describe('realDocxFiles', () => {
  const REPO_CACHE = new URL('../../tools/moreapps/.cache/real-docx.txt',
    import.meta.url);
  it('searches nothing unless MOREAPPS_REAL_DOCX=1', async () => {
    assert.deepEqual(realDocxRoots({}), []);
    assert.deepEqual(realDocxRoots({MOREAPPS_REAL_DOCX: '0'}), []);
    const t0 = Date.now();
    assert.deepEqual(await realDocxFiles({}), []);
    assert.ok(Date.now() - t0 < 100);
  });
  it('when enabled: system folders and the listed ones, never home',
    () => {
      const home = homedir();
      const roots = realDocxRoots({MOREAPPS_REAL_DOCX: '1', HOME: home,
        MOREAPPS_REAL_DOCX_DIRS: '/tmp/a:/tmp/b c:'});
      assert.deepEqual(roots, ['/Applications', '/System/Library',
        '/Library', '/usr/share', '/tmp/a', '/tmp/b c']);
      assert.ok(!roots.includes(home));
    });
  it('finds files in the listed folders; keeps no list in the repo',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'real-docx-'));
      mkdirSync(join(dir, 'sub'));
      writeFileSync(join(dir, 'sub', 'a.docx'), 'x');
      writeFileSync(join(dir, '~$lock.docx'), 'x');
      try {
        const list = await realDocxFiles({MOREAPPS_REAL_DOCX: '1',
          MOREAPPS_REAL_DOCX_DIRS: dir}, {system: false});
        assert.deepEqual(list, [join(dir, 'sub', 'a.docx')]);
        assert.ok(!existsSync(REPO_CACHE), 'no list in tools/moreapps');
      } finally {
        rmSync(dir, {recursive: true, force: true});
      }
    });
});

describe('withNewParts: only the styles and numbering additions', () => {
  it('takes the new parts\' relationships, nothing else', async () => {
    const {Document} = await import('../../tools/moreapps/!Letters/Document');
    const {Typing} = await import('../../tools/moreapps/!Letters/Typing');
    const {toggleList} = await import('../../tools/moreapps/!Letters/ListMake');
    const {writeDocx} = await import('../../tools/moreapps/!Letters/DocxWrite');
    const {expectedBack, withNewParts} = await import('./docx-compare.mjs');
    const {C} = await import('./edit-docs.mjs');
    const d = new Document(await readDocx(await buildDocx({
      'word/document.xml': documentXml(p(r('a'))),
      'word/styles.xml': stylesXml('')})));
    toggleList(d, new Typing(d), C(d, 0, 0), {kind: 'bullet'});
    const got = await readDocx(await writeDocx(d.doc));
    const want = expectedBack(d.doc);
    assert.deepEqual(withNewParts(want, got).rels, got.rels);
    assertSameDoc(got, withNewParts(want, got));
    // one more relationship of another kind (a hyperlink, an image):
    // not taken, so assertSameDoc finds it
    const odd = structuredClone(got);
    odd.rels.push({id: 'rIdX', type: 'http://schemas.openxmlformats.' +
      'org/officeDocument/2006/relationships/hyperlink',
    target: 'http://x.org/', mode: 'External', attrs: []});
    assert.notDeepEqual(withNewParts(want, odd).rels, odd.rels);
    assert.throws(() => assertSameDoc(odd, withNewParts(want, odd)));
    // a numbering relationship to a part that was not added
    const two = structuredClone(got);
    const n = two.rels.find((x) => x.type.endsWith('/numbering'));
    two.rels.push({...n, id: 'rIdY', target: 'other.xml'});
    assert.notDeepEqual(withNewParts(want, two).rels, two.rels);
  });
});

describe('roundtrip-lib: an xmllint extension error passed over', () => {
  it('only for an attribute the opened part has on that element',
    async () => {
      const {extKey, extAttrs} = await import('./roundtrip-lib.mjs');
      const W = 'http://schemas.openxmlformats.org/wordprocessingml/' +
        '2006/main';
      const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
      const msg = (el, at) => `element ${el}: Schemas validity error : ` +
        `Element '{${W}}${el}', attribute '{${W14}}${at}': The ` +
        `attribute '{${W14}}${at}' is not allowed.`;
      const had = extAttrs(new TextEncoder().encode(`<w:document ` +
        `xmlns:w="${W}" xmlns:w14="${W14}"><w:body><w:p ` +
        'w14:paraId="1"/></w:body></w:document>'));
      assert.ok(had.has(extKey(msg('p', 'paraId'))));
      assert.ok(!had.has(extKey(msg('p', 'textId'))));
      assert.ok(!had.has(extKey(msg('r', 'paraId'))));
      assert.equal(extKey('element jc: The value is wrong'), null);
    });
});

// expectedBack and a Table of Contents content control split by a
// section break (WriteBody, TocSdt "Known limits"): the section whose
// last paragraph is in the wrapper is written with an empty paragraph
// after the wrapper to carry its sectPr, and the wrapper is written
// once per section, so it reads back as two (sdt.seq 1, 2)
describe('expectedBack: a section break inside a TOC wrapper', () => {
  const TOC_PR = '<w:sdtPr><w:id w:val="-1234567"/><w:docPartObj>' +
    '<w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/>' +
    '</w:docPartObj></w:sdtPr>';
  const TOC = `<w:sdt>${TOC_PR}<w:sdtContent>` +
    p(r('Contents'), '<w:pStyle w:val="TOCHeading"/>') +
    p(r('Entry A')) + p(r('Entry B')) + '</w:sdtContent></w:sdt>';
  const BODY = p(r('One')) + TOC + p(r('Two'));
  /** Opened, a Next page break at the end of block k of the body
   * (none: k null), written and read back: {d, got, want}. */
  const trip = async (k) => {
    const {Document} = await import('../../tools/moreapps/!Letters/Document');
    const {Typing} = await import('../../tools/moreapps/!Letters/Typing');
    const {run} = await import('../../tools/moreapps/!Letters/EditApply');
    const S = await import('../../tools/moreapps/!Letters/Selection');
    const {writeDocx} = await import('../../tools/moreapps/!Letters/DocxWrite');
    const {expectedBack, withNewParts} = await import('./docx-compare.mjs');
    const d = new Document(await readDocx(await buildDocx({
      'word/document.xml': documentXml(BODY)})));
    if (k !== null) {
      const b = d.doc.sections[0].blocks[k];
      assert.ok(run('sectionNext', d, new Typing(d),
        S.caret({id: b.id, off: b.text.length})), 'break made');
    }
    const got = await readDocx(await writeDocx(d.doc));
    return {d, got, want: withNewParts(expectedBack(d.doc), got)};
  };
  const texts = (doc) => doc.sections.map((s) => s.blocks.map((b) =>
    b.text));
  const seqs = (doc) => doc.sections.map((s) => s.blocks.map((b) =>
    (b.sdt ? b.sdt.seq : 0)));

  it('a break after a wrapped paragraph: the carrier paragraph and ' +
    'a second wrapper expected', async () => {
    const {d, got, want} = await trip(1);   // after 'Contents'
    // (the model: no carrier, one wrapper)
    assert.deepEqual(texts(d.doc), [['One', 'Contents'],
      ['', 'Entry A', 'Entry B', 'Two']]);
    assert.deepEqual(texts(got), [['One', 'Contents', ''],
      ['', 'Entry A', 'Entry B', 'Two']]);
    assert.deepEqual(texts(want), texts(got));
    assert.deepEqual(seqs(want), [[0, 1, 0], [2, 2, 2, 0]]);
    assertSameDoc(got, want, 'split wrapper');
  });

  it('the file read back otherwise still differs', async () => {
    const {newPara: Para} = await import(
      '../../tools/moreapps/!Letters/Model');
    const {got, want} = await trip(1);
    // no carrier paragraph
    const a = structuredClone(got);
    a.sections[0].blocks.pop();
    assert.throws(() => assertSameDoc(a, want), assert.AssertionError);
    // an extra empty paragraph elsewhere
    const b = structuredClone(got);
    b.sections[1].blocks.push(Para(''));
    assert.throws(() => assertSameDoc(b, want), assert.AssertionError);
    const b2 = structuredClone(got);
    b2.sections[0].blocks.splice(1, 0, Para(''));
    assert.throws(() => assertSameDoc(b2, want), assert.AssertionError);
    // a different text, a wrapper not split
    const c = structuredClone(got);
    c.sections[1].blocks[1].text = 'Entry X';
    assert.throws(() => assertSameDoc(c, want), /\.text/);
    const e = structuredClone(got);
    for (const x of e.sections[1].blocks) {
      if (x.sdt) x.sdt = e.sections[0].blocks[1].sdt;
    }
    assert.throws(() => assertSameDoc(e, want), /seq/);
  });

  it('a wrapper with no break, a break outside the wrapper: as ' +
    'before', async () => {
    const none = await trip(null);
    assert.deepEqual(texts(none.want), texts(none.d.doc));
    assert.deepEqual(seqs(none.want), [[0, 1, 1, 1, 0]]);
    assertSameDoc(none.got, none.want, 'no break');
    const out = await trip(0);   // after 'One', before the wrapper
    assert.deepEqual(texts(out.want), texts(out.d.doc));
    assert.deepEqual(texts(out.want), [['One'],
      ['', 'Contents', 'Entry A', 'Entry B', 'Two']]);
    assertSameDoc(out.got, out.want, 'break outside');
  });
});
