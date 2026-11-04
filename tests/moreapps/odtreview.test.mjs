// ODT import, task 8: links, bookmarks, fields, indexes, tracked
// changes and comments. Inputs are spec-derived fixtures
// (odt-helpers.mjs, from OpenDocument 1.3: part 3, 6.1.8 text:a,
// 6.2 bookmarks, 7 and 8 fields, 8.3 indexes, 5.5 tracked changes,
// 14.1 office:annotation), not files from an office program. Every
// Doc read round-trips through DocxWrite -> readDocx and goes to
// emit() for the real-Word check.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readOdt} from '../../tools/moreapps/!Letters/OdtRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {assertSameDoc, expectedBack, withNewParts, withNewStories,
  withNewReview} from './docx-compare.mjs';
import {lintPackage} from './lint-package.mjs';
import {emit} from './word-emit.mjs';
import {makeOdt, NS} from './odt-helpers.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const paras = (doc) => blocks(doc).filter((b) => b.type === 'p');

async function roundTrips(doc, what) {
  for (const b of blocks(doc)) checkBlock(b);
  const bytes = await writeDocx(doc, {date: DATE});
  emit('odt-review-' + what.replaceAll(' ', '-'), bytes);
  const errors = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  assert.deepEqual(errors, [], what);
  const back = await readDocx(bytes);
  assertSameDoc(back, withNewReview(withNewStories(withNewParts(
    expectedBack(doc), back), back), back), what);
  return back;
}

const go = async (content, what, opts = {}) => {
  const r = await readOdt(makeOdt({content}), {date: DATE, ...opts});
  const back = await roundTrips(r.doc, what);
  return {...r, back};
};
const P = (t, extra = '') => `<text:p${extra}>${t}</text:p>`;

/** The inline nodes of every paragraph: [name, attrs]. */
function nodes(doc) {
  const out = [];
  for (const p of paras(doc)) {
    for (const x of Object.values(p.inlines || {})) {
      if (x.node) out.push({...x, name: x.node.name,
        attrs: Object.fromEntries(x.node.attrs)});
    }
  }
  return out;
}
const links = (doc) => nodes(doc).filter((n) => n.name ===
  'w:hyperlink');
const instr = (doc) => nodes(doc).filter((n) => n.name ===
  'w:instrText').map((n) => n.node.children.join(''));
/** [text, kind, author] of each tagged stretch of the paragraphs. */
function tracked(doc) {
  const out = [];
  for (const p of paras(doc)) {
    for (const r of p.runs) {
      if (r.rev) out.push([p.text.slice(r.start, r.end), r.rev.kind,
        r.rev.author]);
    }
  }
  return out;
}
const marks = (doc) => paras(doc).filter((p) => p.pPr.extra.some((x) =>
  x.name === 'w:rPr' && x.children.some((c) => c.name === 'w:del' ||
  c.name === 'w:ins'))).length;

const TABLE = (...regions) => '<text:tracked-changes>' +
  regions.join('') + '</text:tracked-changes>';
const REGION = (id, kind, who, when, content = '') =>
  `<text:changed-region text:id="${id}"><text:${kind}>` +
  '<office:change-info>' + (who === null ? '' :
    `<dc:creator>${who}</dc:creator>`) +
  `<dc:date>${when}</dc:date></office:change-info>${content}` +
  `</text:${kind}></text:changed-region>`;
const INS = (id, who = 'Ann') => REGION(id, 'insertion', who,
  '2024-05-06T07:08:09');
const DEL = (id, content, who = 'Bob') => REGION(id, 'deletion', who,
  '2024-05-07T07:08:09', content);
const S = (id) => `<text:change-start text:change-id="${id}"/>`;
const E = (id) => `<text:change-end text:change-id="${id}"/>`;
const AT = (id) => `<text:change text:change-id="${id}"/>`;

describe('ODT links, bookmarks and fields', () => {
  it('an internal and an external link', async () => {
    const {doc, notes, back} = await go(P('See <text:a xlink:href="' +
      'http://example.org/a?b=1&amp;c=2">the <text:span>site</text:span>' +
      '</text:a>, <text:a xlink:href="#Mark">here</text:a> or ' +
      '<text:a xlink:href="mailto:a@b.org">mail</text:a>. ' +
      '<text:bookmark text:name="Mark"/>'), 'links');
    assert.deepEqual(notes, []);
    const l = links(doc);
    assert.equal(l.length, 3);
    assert.equal(l[0].text, 'the site');
    assert.ok(l[0].attrs['r:id']);
    assert.equal(l[1].attrs['w:anchor'], 'Mark');
    assert.equal(l[1].text, 'here');
    const rel = doc.rels.find((r) => r.id === l[0].attrs['r:id']);
    assert.equal(rel.target, 'http://example.org/a?b=1&c=2');
    assert.equal(links(back).length, 3);
    assert.equal(nodes(doc).filter((n) => n.name ===
      'w:bookmarkStart').length, 1);
  });

  it('other schemes, relative paths and bad addresses keep only ' +
    'their text, with one note', async () => {
    const hrefs = ['javascript:alert(1)', 'file:///etc/passwd',
      'data:text/html;base64,AAAA', 'FILE:///C:/x', 'vbscript:x',
      '../other.odt', '', 'http://a.org/' + 'x'.repeat(5000),
      'http://a.org/\u0085b', 'java\tscript:alert(1)'];
    const body = hrefs.map((h, i) => `<text:a xlink:href="${h}">t${i}` +
      '</text:a>').join(' ');
    const {doc, notes} = await go(P(body), 'bad hrefs');
    assert.equal(links(doc).length, 0);
    assert.match(paras(doc)[0].text, /^t0 t1 t2 t3 t4 t5 t6 t7 t8 t9$/);
    assert.equal(notes.filter((n) => /links to files/.test(n)).length,
      1);
    assert.deepEqual(instr(doc).filter((c) => /HYPERLINK/.test(c)), []);
  });

  it('links nested and very deep read as text inside', async () => {
    const deep = '<text:span>'.repeat(100) + 'x' + '</text:span>'
      .repeat(100);
    const nest = '<text:a xlink:href="http://a.org/">'.repeat(60) +
      deep + '</text:a>'.repeat(60);
    const {doc} = await go(P(nest), 'deep links');
    assert.equal(links(doc).length, 1);
    assert.equal(paras(doc)[0].text.replaceAll('\uFFFC', ''), '');
  });

  it('a page-number field is a PAGE field', async () => {
    const {doc, notes} = await go(P('Page <text:page-number ' +
      'text:select-page="current">3</text:page-number> of <text:' +
      'page-count>9</text:page-count>, <text:date style:data-style-' +
      'name="N1" text:date-value="2024-01-02">02/01/24</text:date> ' +
      '<text:time>10:11</text:time> <text:title>T</text:title> ' +
      '<text:author-name>Ann</text:author-name> <text:file-name>f.odt' +
      '</text:file-name> <text:sequence text:name="Illustration" ' +
      'text:formula="ooow:Illustration+1">4</text:sequence>'), 'fields');
    assert.deepEqual(notes, []);
    assert.deepEqual(instr(doc).map((c) => c.trim()), ['PAGE',
      'NUMPAGES', 'DATE', 'TIME', 'TITLE', 'AUTHOR', 'FILENAME',
      'SEQ Illustration']);
    assert.match(paras(doc)[0].text, /3.*9.*02\/01\/24.*10:11.*T.*Ann/);
  });

  it('a fixed date is its text; a bad sequence name is its text',
    async () => {
      const {doc} = await go(P('<text:date text:fixed="true">1 May' +
        '</text:date> <text:sequence text:name="a b&quot;c">7</text:' +
        'sequence> <text:sequence text:name="Table1">8</text:sequence>'),
      'fixed');
      assert.deepEqual(instr(doc).map((c) => c.trim()), ['SEQ Table1']);
      assert.match(paras(doc)[0].text, /1 May.*7/);
    });

  it('references, and an unknown text: field reads its result text',
    async () => {
      const {doc, notes} = await go(P('<text:bookmark-start text:name=' +
        '"Target"/>t<text:bookmark-end text:name="Target"/> ' +
        '<text:bookmark-ref text:ref-name="Target" text:reference-' +
        'format="text">t</text:bookmark-ref> <text:reference-ref text:' +
        'ref-name="Target" text:reference-format="page">2</text:' +
        'reference-ref> <text:user-field-get text:name="u">UserVal' +
        '</text:user-field-get> <text:variable-get text:name="v">VV' +
        '</text:variable-get> <text:database-display text:column-name=' +
        '"c">Db</text:database-display> <text:conditional-text>Cond' +
        '</text:conditional-text> <text:hidden-text>Hid</text:' +
        'hidden-text> <text:note-ref text:ref-name="n">4</text:' +
        'note-ref> <text:meta><text:span>M</text:span></text:meta> ' +
        '<text:ruby><text:ruby-base>Base</text:ruby-base><text:' +
        'ruby-text>rt</text:ruby-text></text:ruby>'), 'unknown fields');
      assert.deepEqual(instr(doc).map((c) => c.trim()),
        ['REF "Target" \\h', 'PAGEREF "Target" \\h']);
      const t = paras(doc)[0].text.replaceAll('\uFFFC', '');
      for (const w of ['UserVal', 'VV', 'Db', 'Cond', 'Hid', '4', 'M',
        'Base']) assert.ok(t.includes(w), w);
      assert.ok(!t.includes('rt'));
      assert.equal(notes.filter((n) => /ruby/.test(n)).length, 1);
      assert.equal(notes.length, 1);
    });

  it('a content control and a form field read as their content',
    async () => {
      const {doc, notes} = await go(P('<loext:content-control xmlns:' +
        'loext="urn:org:documentfoundation:names:experimental:office:' +
        'xmlns:loext:1.0">in <text:span>CC</text:span></loext:content-' +
        'control> <field:fieldmark xmlns:field="urn:openoffice:names:' +
        'experimental:ooo-ms-interop:xmlns:field:1.0"><field:fieldmark-' +
        'start/>FM</field:fieldmark>'), 'controls');
      assert.equal(paras(doc)[0].text, 'in CC FM');
      assert.deepEqual(notes, []);
    });

  it('field results holding fields and links read as text',
    async () => {
      const {doc} = await go(P('<text:user-field-get text:name="u">' +
        'a <text:page-number>1</text:page-number><text:a xlink:href=' +
        '"http://a.org/">b</text:a> <text:s text:c="2"/>c<text:note ' +
        'text:note-class="footnote"><text:note-body><text:p>fn</text:' +
        'p></text:note-body></text:note></text:user-field-get>'),
      'nested results');
      assert.equal(instr(doc).length, 0);
      assert.equal(links(doc).length, 0);
      assert.equal(paras(doc)[0].text, 'a 1b c');
    });

  it('bookmarks: odd names, duplicates and a hundred thousand',
    async () => {
      const odd = ['a b', 'x\u0085y', '', ' ', 'a&quot;b', 'dup', 'dup',
        'Ünï', 'x'.repeat(5000), '__RefHeading___Toc1_2'];
      let body = odd.map((n) => `<text:bookmark text:name="${n}"/>`)
        .join('');
      const r1 = await go(P(body + 'x'), 'odd bookmarks');
      const names = nodes(r1.doc).filter((n) => n.name ===
        'w:bookmarkStart').map((n) => n.attrs['w:name']);
      assert.ok(names.includes('dup') && names.includes('Ünï'));
      assert.equal(names.filter((n) => n === 'dup').length, 1);
      body = '';
      for (let i = 0; i < 100010; i++) {
        body += `<text:bookmark text:name="b${i}"/>`;
      }
      const t = Date.now();
      const r = await readOdt(makeOdt({content: P(body + 'x')}), {});
      assert.ok(Date.now() - t < 20000);
      const n = nodes(r.doc).filter((q) => q.name ===
        'w:bookmarkStart').length;
      assert.ok(n <= 100000 && n > 90000, String(n));
    });

  it('a table of contents is kept as plain paragraphs with one note',
    async () => {
      const toc = '<text:table-of-content text:name="T"><text:table-of-' +
        'content-source/><text:index-body><text:index-title><text:p ' +
        'text:style-name="Contents_20_Heading">Contents</text:p>' +
        '</text:index-title><text:p><text:a xlink:href="#__Ref1">One' +
        '<text:tab/>1</text:a></text:p><text:p><text:a xlink:href=' +
        '"#__Ref2">Two<text:tab/>2</text:a></text:p></text:index-body>' +
        '</text:table-of-content>';
      const idx = '<text:alphabetical-index><text:index-body><text:p>' +
        'abc 1</text:p></text:index-body></text:alphabetical-index>';
      const {doc, notes} = await go(toc + P('Body') + idx, 'toc');
      assert.deepEqual(paras(doc).map((p) => p.text.replaceAll(
        '\uFFFC', '')), ['Contents', '', '', 'Body', 'abc 1']);
      assert.deepEqual(links(doc).map((l) => [l.text.slice(0, 3),
        l.attrs['w:anchor']]), [['One', '__Ref1'], ['Two', '__Ref2']]);
      assert.equal(notes.length, 1);
      assert.match(notes[0], /plain text/);
    });

  it('fields outside a paragraph are ignored; none is a dangerous one',
    async () => {
      const {doc} = await go('<text:page-number>1</text:page-number>' +
        '<text:bookmark text:name="q"/>' + P('x<text:dde-connection ' +
        'text:connection-name="c">r</text:dde-connection><text:script ' +
        'xlink:href="file:///x">evil()</text:script>'), 'outside');
      // (a DDE link's stored text is kept, as a field's result; task 9)
      assert.equal(paras(doc)[0].text, 'xr');
      assert.deepEqual(instr(doc), []);
    });
});

describe('ODT fields in headers and footers', () => {
  it('a PAGE field in a footer; comments and changes there are ' +
    'plain or left out', async () => {
    const styles = '<?xml version="1.0"?><office:document-styles ' +
      `${NS} office:version="1.3"><office:styles/><office:automatic-` +
      'styles><style:page-layout style:name="pm1"><style:page-layout-' +
      'properties fo:page-width="21cm" fo:page-height="29.7cm"/>' +
      '</style:page-layout></office:automatic-styles><office:master-' +
      'styles><style:master-page style:name="Standard" style:page-' +
      'layout-name="pm1"><style:footer><text:p>Page <text:page-number>' +
      '1</text:page-number> <text:a xlink:href="http://a.org/">u' +
      '</text:a><office:annotation><text:p>c</text:p></office:' +
      'annotation></text:p></style:footer></style:master-page>' +
      '</office:master-styles></office:document-styles>';
    const r = await readOdt(makeOdt({content: P('Body'), styles}),
      {date: DATE});
    await roundTrips(r.doc, 'footer fields');
    assert.ok(r.notes.some((n) => /headers, footers/.test(n)));
    assert.ok(r.doc.sections[0].props.extra.length > 0);
  });
});

describe('ODT tracked changes', () => {
  it('a deletion and an insertion by two authors read as tracked',
    async () => {
      const {doc, notes} = await go(TABLE(INS('c1'), DEL('c2',
        '<text:p>cut</text:p>')) + P('Keep ' + S('c1') + 'added' +
        E('c1') + ' more ' + AT('c2') + 'end'), 'two authors');
      assert.deepEqual(notes, []);
      assert.deepEqual(tracked(doc), [['added', 'ins', 'Ann'],
        ['cut', 'del', 'Bob']]);
      assert.equal(paras(doc)[0].text, 'Keep added more cutend');
      const run = paras(doc)[0].runs.find((r) => r.rev &&
        r.rev.kind === 'ins').rev;
      assert.equal(run.date, '2024-05-06T07:08:09Z');
    });

  it('a deletion spanning two paragraphs', async () => {
    const {doc} = await go(TABLE(DEL('c2', '<text:p>one</text:p>' +
      '<text:p>two</text:p><text:p>three</text:p>')) +
      P('Before ' + AT('c2') + 'after') + P('Last'), 'spanning');
    const ps = paras(doc);
    assert.deepEqual(ps.map((p) => p.text), ['Before one', 'two',
      'threeafter', 'Last']);
    assert.deepEqual(tracked(doc), [['one', 'del', 'Bob'],
      ['two', 'del', 'Bob'], ['three', 'del', 'Bob']]);
    assert.equal(marks(doc), 2);
  });

  it('a deletion between paragraphs is whole deleted paragraphs',
    async () => {
      const {doc} = await go(TABLE(DEL('c2', '<text:p>x</text:p>' +
        '<text:p>y</text:p>')) + P('A') + AT('c2') + P('B'), 'block');
      assert.deepEqual(paras(doc).map((p) => p.text), ['A', 'x', 'y',
        'B']);
      assert.equal(marks(doc), 2);
    });

  it('insertions over paragraphs mark the paragraphs inside',
    async () => {
      const {doc} = await go(TABLE(INS('c1')) + P('a' + S('c1') + 'b') +
        P('c') + P('d' + E('c1') + 'e'), 'ins paras');
      assert.deepEqual(tracked(doc), [['b', 'ins', 'Ann'],
        ['c', 'ins', 'Ann'], ['d', 'ins', 'Ann']]);
      assert.equal(marks(doc), 2);
    });

  it('format changes are silent; nesting takes the innermost',
    async () => {
      const {doc, notes} = await go(TABLE(REGION('f', 'format-change',
        'Z', '2024-01-01T00:00:00'), INS('c1'), INS('c3', 'Cy')) +
        P(S('f') + 'fmt' + E('f') + S('c1') + 'a' + S('c3') + 'b' +
        E('c3') + 'c' + E('c1')), 'nest');
      assert.deepEqual(notes, []);
      assert.deepEqual(tracked(doc), [['a', 'ins', 'Ann'],
        ['b', 'ins', 'Cy'], ['c', 'ins', 'Ann']]);
    });

  it('unmatched, missing, repeated and unknown ids are ignored with ' +
    'one note each', async () => {
    const {doc, notes} = await go(TABLE(INS('c1'), INS('c1'), INS('c4'),
      '<text:changed-region><text:insertion/></text:changed-region>',
      DEL('c9', '<text:p>d</text:p>')) + P('a' + S('c1') + 'b' +
      S('zz') + E('zz') + E('c4') + AT('zz') + AT('c9') + 'x' + AT('c9')),
    'bad ids');
    assert.equal(paras(doc)[0].text, 'abdx');
    assert.deepEqual(tracked(doc), [['d', 'del', 'Bob']]);
    assert.equal(notes.length, new Set(notes).size);
    assert.ok(notes.some((n) => /never ends/.test(n)));
    assert.ok(notes.some((n) => /not in the list/.test(n)));
    assert.ok(notes.some((n) => /no start/.test(n)));
    assert.ok(notes.some((n) => /no id/.test(n)));
  });

  it('marks with no table at all are ignored', async () => {
    const {doc, notes} = await go(P('a' + S('c1') + 'b' + E('c1') +
      AT('c1')), 'no table');
    assert.equal(paras(doc)[0].text, 'ab');
    assert.deepEqual(tracked(doc), []);
    assert.equal(notes.length, 1);
  });

  it('a deletion holding a table or a list', async () => {
    const {doc, notes} = await go(TABLE(DEL('c2', '<text:p>a</text:p>' +
      '<table:table><table:table-row><table:table-cell><text:p>in' +
      '</text:p></table:table-cell></table:table-row></table:table>' +
      '<text:list><text:list-item><text:p>li</text:p></text:list-item>' +
      '</text:list>')) + P('x' + AT('c2')), 'del table');
    assert.deepEqual(tracked(doc).map((t) => t[0]), ['a', 'li']);
    assert.ok(notes.some((n) => /tables in deleted/.test(n)));
  });

  it('a deletion in a note or header is left out', async () => {
    const {doc, notes} = await go(TABLE(DEL('c2', '<text:p>d</text:p>',
      'Bob')) + P('a<text:note text:note-class="footnote"><text:' +
      'note-body><text:p>n' + AT('c2') + '</text:p></text:note-body>' +
      '</text:note>'), 'del note');
    assert.deepEqual(tracked(doc), []);
    assert.ok(notes.some((n) => /headers, footers/.test(n)));
  });

  it('an insertion with no author or date, and no more than 1000 ' +
    'authors', async () => {
    let t = '', body = '';
    for (let i = 0; i < 1100; i++) {
      t += INS('c' + i, 'A' + i);
      body += S('c' + i) + 'x' + E('c' + i);
    }
    t += REGION('n', 'insertion', null, '');
    body += S('n') + 'y' + E('n');
    const {doc, notes} = await go(TABLE(t) + P(body), 'many authors');
    const tr = tracked(doc);
    // (the ones past the cap have no author: they run together)
    assert.equal(new Set(tr.map((x) => x[2])).size, 1001);
    assert.equal(tr.at(-1)[2], undefined);
    assert.equal(tr.map((x) => x[0]).join('').length, 1101);
    assert.ok(notes.some((n) => /authors/.test(n)));
  });

  it('10,000 tracked-change regions stay quick', async () => {
    let t = '', body = '';
    for (let i = 0; i < 10000; i++) {
      t += i % 2 ? INS('c' + i) : DEL('c' + i, '<text:p>d</text:p>');
      body += i % 2 ? S('c' + i) + 'i' + E('c' + i) : AT('c' + i);
    }
    const start = Date.now();
    const r = await readOdt(makeOdt({content: TABLE(t) + P(body)}),
      {date: DATE});
    assert.ok(Date.now() - start < 15000);
    assert.equal(tracked(r.doc).length, 10000);
    await roundTrips(r.doc, 'many regions');
  });

  it('a hostile table: odd ids, cycles, huge content', async () => {
    const t = TABLE(INS('__proto__'), INS('constructor'), INS(''),
      INS('a'.repeat(100000)), DEL('d', '<text:p>' + 'z'.repeat(
        100000) + '</text:p>'));
    const {doc} = await go(t + P(S('__proto__') + 'p' + E('__proto__') +
      AT('d') + AT('toString') + AT('constructor')), 'hostile table');
    assert.equal(tracked(doc).length, 2);
  });
});

describe('ODT comments', () => {
  const A = (name, who, text, extra = '') => '<office:annotation ' +
    `office:name="${name}"${extra}>` + (who === null ? '' :
    `<dc:creator>${who}</dc:creator>`) + '<dc:date>2024-05-06T07:08:' +
    `09</dc:date><meta:creator-initials>AB</meta:creator-initials>` +
    `<text:p>${text}</text:p></office:annotation>`;
  const AE = (name) => `<office:annotation-end office:name="${name}"/>`;
  const all = (doc) => [...doc.comments.map.values()];

  it('a comment anchored over a range with its text and author',
    async () => {
      const {doc, notes, back} = await go(P('Some ' + A('a1', 'Ann',
        'Check <text:span>this</text:span>') + 'marked text' +
        AE('a1') + ' after'), 'range');
      assert.deepEqual(notes, []);
      const [c] = all(doc);
      assert.deepEqual([c.author, c.initials, c.date],
        ['Ann', 'AB', '2024-05-06T07:08:09Z']);
      assert.ok(c.blocks[0].text.endsWith('Check this'));
      const kinds = nodes(doc).map((n) => n.name);
      assert.ok(kinds.indexOf('w:commentRangeStart') <
        kinds.indexOf('w:commentRangeEnd'));
      assert.ok(kinds.includes('w:commentReference'));
      assert.equal(all(back).length, 1);
    });

  it('a point comment, one with no author, a reply', async () => {
    const {doc} = await go(P('a' + A('p1', null, 'point') + 'b' +
      A('p2', 'Bob', 'reply', ' xmlns:loext="urn:org:documentfoundation' +
      ':names:experimental:office:xmlns:loext:1.0" loext:parent-name=' +
      '"p1"') + 'c'),
    'point and reply');
    const [p1, p2] = all(doc);
    assert.equal(p1.author, '');
    assert.equal(p2.parent, p1.id);
    assert.ok(!nodes(doc).some((n) => n.name === 'w:commentRangeStart'));
  });

  it('an end with no start, and a start whose end comes first',
    async () => {
      const {doc, notes} = await go(P('a' + AE('x') + 'b' + AE('y') +
        A('y', 'Ann', 'late') + 'c'), 'end first');
      assert.equal(all(doc).length, 1);
      assert.equal(paras(doc)[0].text.replaceAll('\uFFFC', ''), 'abc');
      assert.ok(notes.some((n) => /no start/.test(n)));
      assert.ok(notes.some((n) => /end is missing/.test(n)));
    });

  it('a comment over several paragraphs', async () => {
    const {doc} = await go(P('a' + A('m', 'Ann', 'multi') + 'b') +
      P('c') + P('d' + AE('m') + 'e'), 'multi');
    assert.equal(all(doc).length, 1);
  });

  it('comments in a table cell, tables and pictures in a comment',
    async () => {
      const a = '<office:annotation office:name="t"><dc:creator>Ann' +
        '</dc:creator><text:p>keep</text:p><table:table><table:' +
        'table-row><table:table-cell><text:p>in</text:p></table:' +
        'table-cell></table:table-row></table:table><text:p>pic' +
        '<draw:frame><draw:image xlink:href="Pictures/a.png"/></draw:' +
        'frame></text:p></office:annotation>';
      const cell = '<table:table><table:table-row><table:table-cell>' +
        P('cell' + a) + '</table:table-cell></table:table-row>' +
        '</table:table>';
      const {doc, notes} = await go(cell, 'in table');
      const [c] = all(doc);
      assert.deepEqual(c.blocks.map((b) => b.text.replaceAll('\uFFFC',
        '')), ['keep', 'pic']);
      assert.equal(notes.filter((n) => /pictures in comments/.test(n))
        .length, 1);
    });

  it('comments in a header, a footnote or between paragraphs are ' +
    'skipped with one note each', async () => {
    const {doc, notes} = await go(' ' + A('o', 'Ann', 'loose') + P('a<text:' +
      'note text:note-class="footnote"><text:note-body><text:p>n' +
      A('n1', 'Ann', 'in note') + A('n2', 'Ann', 'in note 2') +
      '</text:p></text:note-body></text:note>'), 'skipped');
    assert.equal(all(doc).length, 0);
    assert.equal(notes.filter((n) => /headers, footers and notes/
      .test(n)).length, 1);
    assert.equal(notes.filter((n) => /outside a paragraph/.test(n))
      .length, 1);
  });

  it('10,000 comments, and past the cap', async () => {
    let body = '';
    for (let i = 0; i < 10000; i++) {
      body += A('c' + i, 'A' + (i % 7), 'text ' + i) + 'x';
    }
    const t = Date.now();
    const r = await readOdt(makeOdt({content: P(body)}), {date: DATE});
    assert.ok(Date.now() - t < 30000);
    assert.ok(all(r.doc).length >= 1000);
    await roundTrips(r.doc, 'many comments');
  });

  it('a comment with odd names and control characters', async () => {
    const {doc} = await go(P(A('__proto__', 'A\u0085B', 'x\u007fy') +
      'a' + AE('__proto__') + A('__proto__', 'Z', 'again') +
      AE('constructor')), 'odd comment');
    assert.ok(all(doc).length >= 1);
  });
});

// Task 9: fixes from the reviews of task 8
describe('ODT tracked changes and comments: edge cases', () => {
  const A = (name, text) => `<office:annotation office:name="${name}">` +
    `<dc:creator>Ann</dc:creator><text:p>${text}</text:p>` +
    '</office:annotation>';
  const AE = (name) => `<office:annotation-end office:name="${name}"/>`;
  const all = (doc) => [...doc.comments.map.values()];
  /** The text of the paragraphs with the deleted runs taken out and
   *  the paragraphs whose mark is deleted joined to the next. */
  function accepted(doc) {
    let out = '';
    for (const p of paras(doc)) {
      for (let i = 0; i < p.text.length; i++) {
        const r = p.runs.find((x) => x.start <= i && i < x.end);
        if (!(r && r.rev && r.rev.kind === 'del')) out += p.text[i];
      }
      const del = p.pPr.extra.some((x) => x.name === 'w:rPr' &&
        x.children.some((c) => c.name === 'w:del'));
      if (!del) out += '\n';
    }
    return out;
  }

  it('a deletion ending in a space keeps the live space after it',
    async () => {
      const {doc} = await go(TABLE(DEL('c2', '<text:p>x </text:p>')) +
        P('a' + AT('c2') + ' b'), 'del space');
      assert.equal(accepted(doc), 'a b\n');
      assert.equal(paras(doc)[0].text, 'ax  b');
    });

  it('a deletion over paragraphs keeps the live space after it',
    async () => {
      const {doc} = await go(TABLE(DEL('c3', '<text:p>x</text:p>' +
        '<text:p>y </text:p>')) + P('a' + AT('c3') + ' b'), 'del paras');
      assert.equal(accepted(doc), 'a b\n');
    });

  it('an insertion whose end comes before its start is plain text',
    async () => {
      const {doc, notes} = await go(TABLE(INS('c1')) + P('a' + E('c1') +
        'b' + S('c1') + 'c') + P('d'), 'end before start');
      assert.deepEqual(tracked(doc), []);
      assert.ok(notes.some((n) => /never ends/.test(n)));
    });

  it('an insertion ended again after an early end is still tracked',
    async () => {
      const {doc} = await go(TABLE(INS('c1')) + P('a' + E('c1') + 'b' +
        S('c1') + 'c' + E('c1') + 'd'), 'end twice');
      assert.deepEqual(tracked(doc), [['c', 'ins', 'Ann']]);
    });

  it('a comment whose end comes first is a point comment at its start',
    async () => {
      const {doc, notes} = await go(P('a' + AE('y') + 'b' + A('y',
        'late') + 'c') + P('d'), 'unterminated');
      assert.equal(paras(doc).length, 2);
      assert.equal(all(doc).length, 1);
      assert.ok(!nodes(doc).some((n) => n.name ===
        'w:commentRangeStart'));
      const p = paras(doc)[0];
      assert.equal(p.text.indexOf('￼'), 2);
      assert.ok(notes.some((n) => /end is missing/.test(n)));
    });

  it('a table or a picture directly in a comment is left out with a ' +
    'note, the file\'s tree unchanged', async () => {
      const tbl = '<table:table><table:table-row><table:table-cell>' +
        '<text:p>in</text:p></table:table-cell></table:table-row>' +
        '</table:table>';
      const a = '<office:annotation office:name="t"><dc:creator>Ann' +
        `</dc:creator><text:p>keep</text:p>${tbl}<draw:frame><draw:` +
        'image xlink:href="Pictures/a.png"/></draw:frame><text:p>x' +
        '<draw:frame><draw:image xlink:href="Pictures/a.png"/></draw:' +
        'frame></text:p></office:annotation>';
      const {doc, notes} = await go(P('a' + a + 'b'), 'top table');
      assert.deepEqual(all(doc)[0].blocks.map((b) => b.text
        .replaceAll('￼', '')), ['keep', 'x']);
      assert.equal(notes.filter((n) => /tables and pictures in/
        .test(n)).length, 1);
      const only = '<office:annotation office:name="u"><dc:creator>' +
        `Ann</dc:creator><text:p>k</text:p>${tbl}</office:annotation>`;
      const r = await readOdt(makeOdt({content: P('a' + only + 'b')}));
      assert.ok(r.notes.some((n) => /tables and pictures in/.test(n)));
    });

  it('a comment whose end is in a footnote is a point comment',
    async () => {
      const {doc, notes} = await go(P('a' + A('f', 'over') + 'b<text:' +
        'note text:note-class="footnote"><text:note-body><text:p>n' +
        AE('f') + '</text:p></text:note-body></text:note>c'),
      'end in note');
      assert.equal(all(doc).length, 1);
      assert.ok(!nodes(doc).some((n) => n.name ===
        'w:commentRangeStart'));
      assert.ok(notes.some((n) => /end of a comment in a note/.test(n)));
    });

  it('scripts and DDE links get one note each; a DDE link keeps its ' +
    'text', async () => {
      const sc = '<text:script xmlns:script="urn:oasis:names:tc:' +
        'opendocument:xmlns:script:1.0" script:language="js">alert(1)' +
        '</text:script>';
      const dde = '<text:dde-connection text:connection-name="x">dd' +
        '</text:dde-connection>';
      const {doc, notes} = await go(P('a' + sc + 'b' + dde + sc + dde +
        'c'), 'script dde');
      assert.equal(paras(doc)[0].text, 'abddddc');
      assert.deepEqual(notes.filter((n) => /script|DDE/.test(n)).sort(),
        ['DDE links are not followed: their text is kept',
          'scripts are not read']);
      assert.ok(!notes.some((n) => /unknown element/.test(n)));
    });
});

describe('ODT links and bookmarks found in the corpus (task 9)', () => {
  it('a bookmark name with spaces keeps its spaces as _, its ' +
    'references and links too', async () => {
      const {doc, notes} = await go(P('<text:bookmark-start text:name=' +
        '"_GoBack Copy 1"/>x<text:bookmark-end text:name="_GoBack Copy ' +
        '1"/><text:bookmark text:name="a b"/><text:bookmark-ref ' +
        'text:ref-name="_GoBack Copy 1">x</text:bookmark-ref><text:a ' +
        'xlink:href="#_GoBack Copy 1">go</text:a>'), 'spaced names');
      const names = nodes(doc).filter((n) => n.name ===
        'w:bookmarkStart').map((n) => n.attrs['w:name']);
      assert.deepEqual(names, ['_GoBack_Copy_1', 'a_b']);
      assert.ok(instr(doc).some((c) => c.includes('"_GoBack_Copy_1"')),
        instr(doc).join('|'));
      assert.ok(links(doc).length + instr(doc).filter((c) =>
        c.includes('\\l "_GoBack_Copy_1"')).length >= 1);
      assert.ok(!notes.some((n) => /bookmark/.test(n)), notes.join('; '));
    });

  it('a link in tracked deleted text keeps its text, deleted',
    async () => {
      const {doc} = await go(TABLE(DEL('c2', '<text:p>see <text:a ' +
        'xlink:href="http://example.com/">here</text:a> now</text:p>')) +
        P('a' + AT('c2') + 'b'), 'link deleted');
      assert.deepEqual(tracked(doc), [['see here now', 'del', 'Bob']]);
      assert.equal(paras(doc)[0].text, 'asee here nowb');
    });

  it('a form field\'s parameters are quiet', async () => {
    const fm = '<field:fieldmark field:type="vnd.oasis.opendocument.' +
      'field.FORMCHECKBOX" xmlns:field="urn:openoffice:names:' +
      'experimental:ooo-ms-interop:xmlns:field:1.0"><field:param ' +
      'field:name="Checkbox_Checked" field:value="false"/></field:' +
      'fieldmark>';
    const {notes} = await go(P('a' + fm + 'b'), 'fieldmark param');
    assert.deepEqual(notes, []);
  });
});

// Task 9 fix round 1: text boxes are read after their paragraph, so a
// range never crosses a box's edge (./OdtFind scopes)
describe('ODT tracked changes and comments across text boxes', () => {
  const box = (t) => `<draw:frame><draw:text-box>${t}</draw:text-box>` +
    '</draw:frame>';
  const A = (name, text) => `<office:annotation office:name="${name}">` +
    `<dc:creator>Ann</dc:creator><text:p>${text}</text:p>` +
    '</office:annotation>';
  const AE = (name) => `<office:annotation-end office:name="${name}"/>`;
  const all = (doc) => [...doc.comments.map.values()];
  const tagged = (doc) => tracked(doc).map((t) => t[0]).join('|');

  it('an insertion starting in a box and ending after the frame ' +
    'tags nothing past the box', async () => {
    const {doc} = await go(TABLE(INS('c1')) + P('a' + box(P('x' +
      S('c1') + 'y')) + 'b' + E('c1') + 'c') + P('rest1') + P('rest2'),
    'ins out of box');
    assert.deepEqual(paras(doc).map((p) => p.text), ['abc', 'xy',
      'rest1', 'rest2']);
    assert.equal(tagged(doc), '');
  });

  it('a deletion starting in a box', async () => {
    const {doc} = await go(TABLE(DEL('d1', P('gone'))) + P('a' +
      box(P('x' + S('d1') + 'y')) + 'b' + E('d1') + 'c') + P('rest'),
    'del in box');
    assert.deepEqual(paras(doc).map((p) => p.text), ['abc', 'xgoney',
      'rest']);
    assert.equal(tagged(doc), 'gone');
  });

  it('a comment starting in a box and ending after the frame is a ' +
    'point comment', async () => {
    const {doc, notes} = await go(P('a' + box(P('x' + A('k', 'note') +
      'y')) + 'b' + AE('k') + 'c') + P('rest'), 'comment out of box');
    assert.equal(all(doc).length, 1, notes.join('; '));
    assert.ok(!nodes(doc).some((n) => n.name === 'w:commentRangeStart'));
  });

  it('a start before the frame and an end inside the box tag only ' +
    'the anchor paragraph\'s text', async () => {
    const {doc} = await go(TABLE(INS('c1')) + P('a' + S('c1') + 'b' +
      box(P('x' + E('c1') + 'y')) + 'c') + P('rest') + P('a' + A('m',
      'n') + 'b' + box(P('x' + AE('m') + 'y')) + 'c'), 'into box');
    assert.ok(!/rest/.test(tagged(doc)), tagged(doc));
    assert.equal(all(doc).length, 1);
  });

  it('ranges inside one box, in nested boxes and in a box in a cell',
    async () => {
      const cell = (t) => '<table:table><table:table-column/><table:' +
        `table-row><table:table-cell>${t}</table:table-cell></table:` +
        'table-row></table:table>';
      const {doc} = await go(TABLE(INS('c1'), INS('c2'), INS('c3')) +
        P('a' + box(P('x' + S('c1') + 'in' + E('c1') + 'y')) + 'b') +
        P('n' + box(P('o' + box(P('p' + S('c2') + 'q')) + 'r' +
          E('c2'))) + 's') +
        cell(P('t' + box(P('u' + S('c3') + 'v')) + E('c3') + 'w')) +
        P('rest') + P('k' + box(P(A('z', 'in box') + 'z' + AE('z')))),
      'nested boxes');
      assert.equal(tagged(doc), 'in');
      const cs = all(doc);
      assert.equal(cs.length, 1);
      assert.ok(nodes(doc).some((n) => n.name === 'w:commentRangeStart'));
    });
});

describe('ODT comments past the cap', () => {
  it('the ends of comments the cap drops say nothing; an end with no ' +
    'start still does', async () => {
    // (final review: each dropped comment's end said 'the end of a
    // comment with no start is ignored')
    const N = 10001;
    let p = '';
    for (let i = 0; i < N; i++) {
      p += `<office:annotation office:name="c${i}"><text:p>c</text:p>` +
        `</office:annotation>a<office:annotation-end office:name="c${i}"/>`;
    }
    const r = await readOdt(makeOdt({content: P(p)}), {date: DATE});
    assert.ok(r.notes.includes('more than 10000 comments: the rest are ' +
      'skipped'), r.notes.join('; '));
    assert.ok(!r.notes.some((n) => /with no start/.test(n)),
      r.notes.join('; '));
    const orphan = await readOdt(makeOdt({content: P(p +
      'b<office:annotation-end office:name="none"/>')}), {date: DATE});
    assert.ok(orphan.notes.includes('the end of a comment with no start ' +
      'is ignored'), orphan.notes.join('; '));
  });
});

describe('ODT fields past the cap', () => {
  it('past 50,000 fields and links the rest are their text', async () => {
    // (final review: 800,000 page numbers took 7 s and 1.7 GB)
    const N = 50000;
    const p = '<text:page-number>1</text:page-number>'.repeat(N - 1) +
      '<text:a xlink:href="http://example.org/">L</text:a>' +
      '<text:page-number>2</text:page-number><text:a xlink:href=' +
      '"http://example.org/">M</text:a>';
    const r = await readOdt(makeOdt({content: P(p)}), {date: DATE});
    assert.ok(r.notes.includes('more than 50000 fields: the rest are ' +
      'kept as their results'), r.notes.join('; '));
    const kept = links(r.doc).length + instr(r.doc).filter((c) =>
      /HYPERLINK/.test(c)).length;
    assert.equal(kept, 1);
    assert.equal(instr(r.doc).filter((c) => /PAGE/.test(c)).length,
      N - 1);
    // (the objects are the kept fields' marks and the kept link)
    assert.ok(paras(r.doc)[0].text.replaceAll('\uFFFC', '')
      .endsWith('12M'));
  });
});
