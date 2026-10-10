// LinkOps / LinkFind / LinkUrl / BookmarkFind: hyperlinks inserted,
// edited and removed (Insert > Hyperlink..., Ctrl-K). A link is a raw
// level-'p' w:hyperlink holding w:r runs written by WritePara (each
// run's format kept, w:rStyle Hyperlink), with a new External
// relationship per link (or w:anchor for a bookmark); one undo step
// each, relationships and styles included; addresses cleaned (http,
// https, mailto, ftp only); links never nest; Remove unwraps exactly.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {insertLink, editLink, removeLink, linkAt, linkInfo, selInfo,
  isLink} from '../../tools/moreapps/!Word/LinkOps';
import {cleanUrl, parseAddress, checkAnchor, MAX}
  from '../../tools/moreapps/!Word/LinkUrl';
import {bookmarkNames, findBookmark, linkNames}
  from '../../tools/moreapps/!Word/BookmarkFind';
import {linkUnder} from '../../tools/moreapps/!Word/LinkFind';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {tm} from './word-docs.mjs';
import {hyperlinkStyle} from '../../tools/moreapps/!Word/DocParts';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {Document} from '../../tools/moreapps/!Word/Document';
import {deepEqual} from '../../tools/moreapps/!Word/Model';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {linkUrl} from '../../tools/moreapps/!Word/ClipLinks';
import {keymap, WINDOW} from '../../tools/moreapps/!Word/Keymap';
import {macKey, macLabel, CMD} from '../../tools/moreapps/!Word/MacKeys';
import {mk, P, C, SEL, O, box, valid} from './edit-docs.mjs';
import {buildDocx, documentXml, p, r, REL} from './build-docx.mjs';
import {strictDocx} from './docx-fixtures.mjs';

const DATE = new Date(Date.UTC(2026, 0, 1));
const plain = {extra: []}, bold = {b: true, extra: []};
const ital = {i: true, extra: []};
const RUNS = [{start: 0, end: 4, rPr: plain}, {start: 4, end: 8,
  rPr: bold}, {start: 8, end: 12, rPr: ital}];
/** 'one twothree' in three runs: plain, bold, italic. */
const fmtDoc = () => mk([['one twothree', {runs: RUNS}], 'second']);
const state = (d) => ({sections: structuredClone(d.doc.sections),
  rels: d.doc.rels, styles: d.doc.styles, meta: d.doc.meta});

/** cmd is one undo step; undo gives back the doc, rels and styles. */
function step(d, cmd) {
  const before = state(d), n = d.undoDepth;
  const out = cmd(new Typing(d));
  assert.ok(out && out.sel, 'done: ' + (out && out.error));
  valid(d);
  assert.equal(d.undoDepth, n + 1, 'one undo step');
  const after = state(d);
  d.undo();
  assert.ok(deepEqual(d.doc.sections, before.sections), 'undo exact');
  assert.equal(d.doc.rels, before.rels, 'rels back (same object)');
  assert.equal(d.doc.styles, before.styles, 'styles back');
  d.redo();
  assert.ok(deepEqual(d.doc.sections, after.sections), 'redo exact');
  assert.equal(d.doc.rels, after.rels);
  return out;
}

/** cmd is refused: {error}, nothing changed, no undo step. */
function refused(d, cmd, re) {
  const before = state(d), n = d.undoDepth;
  const out = cmd(new Typing(d));
  assert.ok(out && typeof out.error === 'string', 'refused');
  if (re) assert.match(out.error, re);
  assert.equal(d.undoDepth, n);
  assert.ok(deepEqual(d.doc.sections, before.sections));
  assert.equal(d.doc.rels, before.rels);
  assert.equal(d.doc.styles, before.styles);
  return out.error;
}

const link = (d, k = 0) => Object.values(P(d, k).inlines).find(isLink);
const kids = (x) => x.node.children;
const rStyleOf = (run) => run.children[0].children
  .find((c) => c.name === 'w:rStyle').attrs[0][1];
const write = (doc) => writeDocx(doc, {date: DATE});

describe('LinkUrl: addresses', () => {
  it('www. gets http://; schemes in lower case; spaces encoded', () => {
    assert.deepEqual(cleanUrl('  www.example.com '),
      {url: 'http://www.example.com'});
    assert.deepEqual(cleanUrl('HTTPS://Example.com/a b'),
      {url: 'https://Example.com/a%20b'});
    assert.deepEqual(cleanUrl('mailto:me@example.com'),
      {url: 'mailto:me@example.com'});
    assert.deepEqual(cleanUrl('ftp://files.example.com/x'),
      {url: 'ftp://files.example.com/x'});
    assert.deepEqual(cleanUrl('http://x.org/a?b=1&c=%41#top'),
      {url: 'http://x.org/a?b=1&c=%41#top'});
  });
  it('IRIs and characters a URL may not hold are percent-encoded', () => {
    assert.deepEqual(cleanUrl('http://x.org/caf\u00e9'),
      {url: 'http://x.org/caf%C3%A9'});
    assert.deepEqual(cleanUrl('http://x.org/\u{1F600}'),
      {url: 'http://x.org/%F0%9F%98%80'});
    assert.deepEqual(cleanUrl('http://x.org/"<>\\^`{|}'),
      {url: 'http://x.org/%22%3C%3E%5C%5E%60%7B%7C%7D'});
    assert.deepEqual(cleanUrl('http://x.org/100%'),
      {url: 'http://x.org/100%25'});
  });
  it('hostile and wrong addresses are refused with a message', () => {
    for (const s of ['javascript:alert(1)', 'JavaScript:x',
      ' data:text/html,<b>', 'file:///etc/passwd', 'vbscript:msgbox',
      'about:blank', 'example.com', '/relative', '', '   ',
      'http://', 'https:///path', 'http://a b', 'mailto:', 'ftp:',
      'http://x.org/\u0000', 'http://x.org/\na', 'http://x.org/\u0085',
      'http://x.org/\u007f', 'http://x.org/\ud800', null, 7,
      undefined, 'x'.repeat(1 << 20), 'http://x.org/' + 'a'.repeat(MAX),
      'http://x.org/' + ' '.repeat(700) + 'x']) {
      const got = cleanUrl(s);
      assert.ok(typeof got.error === 'string' && got.error.length,
        JSON.stringify(String(s).slice(0, 40)));
      assert.equal(got.url, undefined);
    }
    assert.match(cleanUrl('javascript:alert(1)').error,
      /not allowed.*http/);
    assert.match(cleanUrl('x'.repeat(3000)).error, /too long/);
    assert.ok(cleanUrl('http://x.org/' + 'a'.repeat(MAX - 13)).url);
  });
  it('#name is a bookmark; checkAnchor', () => {
    assert.deepEqual(parseAddress('#Intro'), {anchor: 'Intro'});
    assert.deepEqual(parseAddress(' #_Toc123 '), {anchor: '_Toc123'});
    for (const s of ['#', '# x', '#a#b', '#a\u0001', '#' + 'a'.repeat(256)])
      assert.ok(parseAddress(s).error, s);
    assert.equal(checkAnchor('__proto__'), null);
    assert.ok(checkAnchor(''));
    assert.deepEqual(parseAddress('www.x.org'), {url: 'http://www.x.org'});
  });
});

describe('insertLink', () => {
  it('over formatted runs: each run kept, w:rStyle Hyperlink, ' +
    'one U+FFFC, caret after, External relationship', () => {
    const d = fmtDoc();
    const out = step(d, (t) => insertLink(d, t, SEL(d, 0, 2, 0, 10),
      {address: 'https://example.com/', tip: 'Go there'}));
    assert.equal(P(d, 0).text, 'on' + O + 'ee');
    assert.deepEqual(out.sel.head, {id: P(d, 0).id, off: 3});
    const x = link(d);
    assert.equal(x.level, 'p');
    assert.equal(x.text, 'e twothr');
    const rs = kids(x).filter((k) => k.name === 'w:r');
    assert.equal(rs.length, 3);
    assert.deepEqual(rs.map(rStyleOf), ['Hyperlink', 'Hyperlink',
      'Hyperlink']);
    assert.ok(rs[1].children[0].children.some((c) => c.name === 'w:b'));
    assert.ok(rs[2].children[0].children.some((c) => c.name === 'w:i'));
    const rel = d.doc.rels.at(-1);
    assert.equal(rel.mode, 'External');
    assert.equal(rel.target, 'https://example.com/');
    assert.match(rel.type, /\/relationships\/hyperlink$/);
    const at = Object.fromEntries(x.node.attrs);
    assert.equal(at['r:id'], rel.id);
    assert.equal(at['w:history'], '1');
    assert.equal(at['w:tooltip'], 'Go there');
    assert.deepEqual(linkInfo(d.doc, x), {text: 'e twothr',
      address: 'https://example.com/', tip: 'Go there'});
  });
  it('the Hyperlink style is added once (Word\'s definition), and ' +
    'undone with the link', () => {
    const d = fmtDoc();
    const st0 = d.doc.styles;
    assert.equal(st0.styles.has('Hyperlink'), false);
    step(d, (t) => insertLink(d, t, SEL(d, 0, 0, 0, 3),
      {address: 'www.a.org'}));
    const st1 = d.doc.styles, h = st1.styles.get('Hyperlink');
    assert.notEqual(st1, st0);
    assert.equal(st0.styles.has('Hyperlink'), false, 'old table kept');
    assert.deepEqual({type: h.type, name: h.name, basedOn: h.basedOn,
      ui: h.uiPriority, unhide: h.unhideWhenUsed, rPr: h.rPr},
    {type: 'character', name: 'Hyperlink',
      basedOn: 'DefaultParagraphFont', ui: 99, unhide: true,
      rPr: {color: '0563C1', u: 'single', extra: []}});
    for (const [id, s] of st0.styles) assert.equal(st1.styles.get(id), s);
    step(d, (t) => insertLink(d, t, SEL(d, 1, 0, 1, 6),
      {address: 'www.b.org'}));
    assert.equal(d.doc.styles, st1, 'second link: no new table');
    const rels = d.doc.rels.filter((x) => /hyperlink$/.test(x.type));
    assert.equal(rels.length, 2, 'a relationship per link');
    assert.notEqual(rels[0].id, rels[1].id);
  });
  it('a document\'s own Hyperlink style is used; no styles: no rStyle',
    () => {
      const d = fmtDoc();
      assert.equal(hyperlinkStyle(null), null);
      const own = hyperlinkStyle(d.doc.styles);
      d.doc.styles = own.styles;
      const st = d.doc.styles;
      step(d, (t) => insertLink(d, t, SEL(d, 0, 0, 0, 3),
        {address: 'www.a.org'}));
      assert.equal(d.doc.styles, st);
      const n = mk([['abc', {runs: [{start: 0, end: 3, rPr: bold}]}]],
        {styles: false});
      step(n, (t) => insertLink(n, t, SEL(n, 0, 0, 0, 3),
        {address: 'www.a.org'}));
      const run = kids(link(n))[0];
      assert.ok(!run.children[0].children.some((c) =>
        c.name === 'w:rStyle'));
    });
  it('at a caret the text typed in the box goes in (the address ' +
    'when none), in the format there', () => {
    const d = fmtDoc();
    step(d, (t) => insertLink(d, t, C(d, 0, 6), {text: 'Here ',
      address: 'mailto:a@b.org'}));
    assert.equal(P(d, 0).text, 'one tw' + O + 'othree');
    const x = link(d);
    assert.equal(x.text, 'Here');
    assert.ok(kids(x)[0].children[0].children.some((c) =>
      c.name === 'w:b'), 'bold, as the text before');
    step(d, (t) => insertLink(d, t, C(d, 1, 0),
      {address: 'www.x.org/p'}));
    assert.equal(link(d, 1).text, 'http://www.x.org/p');
  });
  it('text given that differs from the selection replaces it; ' +
    'control characters in text and tip become spaces', () => {
    const d = fmtDoc();
    step(d, (t) => insertLink(d, t, SEL(d, 0, 4, 0, 8),
      {text: 'A\u0001B\tC', address: 'www.x.org', tip: 'T\nip'}));
    const x = link(d);
    assert.equal(x.text, 'A B C');
    assert.equal(Object.fromEntries(x.node.attrs)['w:tooltip'], 'T ip');
    assert.ok(kids(x)[0].children[0].children.some((c) =>
      c.name === 'w:b'), 'format of the first selected character');
  });
  it('a link to a bookmark: w:anchor, no relationship', () => {
    const d = fmtDoc();
    const rels = d.doc.rels;
    step(d, (t) => insertLink(d, t, SEL(d, 0, 0, 0, 3),
      {address: '#Intro'}));
    let at = Object.fromEntries(link(d).node.attrs);
    assert.equal(at['w:anchor'], 'Intro');
    assert.equal(at['r:id'], undefined);
    assert.equal(d.doc.rels, rels);
    step(d, (t) => insertLink(d, t, SEL(d, 1, 0, 1, 3),
      {anchor: 'Other'}));
    at = Object.fromEntries(link(d, 1).node.attrs);
    assert.equal(at['w:anchor'], 'Other');
    assert.equal(linkInfo(d.doc, link(d, 1)).address, '#Other');
  });
  it('a caret on a table\'s edge gets a paragraph for the link', () => {
    const d = mk(['a', box()]);
    const sel = SEL(d, 1, 1, 1, 1);
    step(d, (t) => insertLink(d, t, sel, {address: 'www.x.org'}));
    assert.equal(P(d, 2).text, O);
  });
  it('refusals change nothing: no address, bad addresses, across ' +
    'paragraphs, around a link or another kept item, a table', () => {
    const d = fmtDoc();
    const sel = SEL(d, 0, 0, 0, 3);
    refused(d, (t) => insertLink(d, t, sel, {}), /address/);
    for (const a of ['javascript:alert(1)', 'data:text/html,x',
      'file:///c:/x', 'vbscript:x', '', 'x'.repeat(5000)]) {
      refused(d, (t) => insertLink(d, t, sel, {address: a}));
    }
    refused(d, (t) => insertLink(d, t, sel, {anchor: 'a b'}));
    refused(d, (t) => insertLink(d, t, SEL(d, 0, 2, 1, 2),
      {address: 'www.x.org'}), /paragraphs/);
    refused(d, (t) => insertLink(d, t, sel, {address: 'www.x.org',
      text: 'x'.repeat(1025)}), /too long/);
    refused(d, (t) => insertLink(d, t, sel, {address: 'www.x.org',
      tip: 'x'.repeat(256)}), /too long/);
    step(d, (t) => insertLink(d, t, SEL(d, 0, 4, 0, 6),
      {address: 'www.x.org'}));
    refused(d, (t) => insertLink(d, t, SEL(d, 0, 0, 0, 8),
      {address: 'www.y.org'}), /inside links/);
    assert.match(selInfo(d.doc, SEL(d, 0, 0, 0, 8)).error, /link/);
    const b = mk([['a' + O + 'b', {inlines: {1: {kind: 'raw',
      level: 'p', node: {name: 'w:bookmarkStart', attrs: [], children:
      []}}}}]]);
    refused(b, (t) => insertLink(b, t, SEL(b, 0, 0, 0, 3),
      {address: 'www.x.org'}), /item/);
    const k = mk(['a', box(), 'b']);
    refused(k, (t) => insertLink(k, t, SEL(k, 1, 0, 1, 1),
      {address: 'www.x.org'}), /table/);
    refused(k, (t) => insertLink(k, t, null, {address: 'www.x.org'}));
  });
  it('a selection holding a tab and a picture: both go inside the ' +
    'link\'s runs, and come back out on Remove', () => {
    const pic = {kind: 'raw', level: 'r', node: {name: 'w:drawing',
      attrs: [], children: []}};
    const d = mk([['ab\tc' + O + 'd', {inlines: {4: pic}}]]);
    const before = structuredClone(P(d, 0));
    step(d, (t) => insertLink(d, t, SEL(d, 0, 1, 0, 5),
      {address: 'www.x.org'}));
    const run = kids(link(d))[0];
    assert.deepEqual(run.children.slice(1).map((c) => c.name),
      ['w:t', 'w:tab', 'w:t', 'w:drawing']);
    step(d, (t) => removeLink(d, t, C(d, 0, 2)));
    assert.equal(P(d, 0).text, before.text);
    assert.ok(deepEqual(P(d, 0).inlines, before.inlines));
  });
  it('selInfo: the selected text, plain or holding items', () => {
    const d = mk([['ab\tc' + O, {inlines: {4: {kind: 'raw', level: 'r',
      node: {name: 'w:drawing', attrs: [], children: []}}}}]]);
    assert.deepEqual(selInfo(d.doc, SEL(d, 0, 0, 0, 2)),
      {text: 'ab', plain: true});
    assert.deepEqual(selInfo(d.doc, SEL(d, 0, 0, 0, 5)),
      {text: 'ab\tc' + O, plain: false});
    assert.deepEqual(selInfo(d.doc, C(d, 0, 1)), {text: '', plain: true});
    assert.equal(selInfo(d.doc, SEL(d, 0, 0, 0, 3)).plain, false, 'a tab');
  });
});

describe('linkAt, editLink, removeLink', () => {
  /** fmtDoc with 'two' (bold) linked to https://a.org/, tip T. */
  function linked() {
    const d = fmtDoc();
    insertLink(d, new Typing(d), SEL(d, 0, 4, 0, 7),
      {address: 'https://a.org/', tip: 'T'});
    d.clearHistory();
    return d;
  }
  it('linkAt: the link selected, or next to a caret (before first)', () => {
    const d = linked();
    for (const sel of [SEL(d, 0, 4, 0, 5), SEL(d, 0, 5, 0, 4), C(d, 0, 4),
      C(d, 0, 5)]) assert.equal(linkAt(d.doc, sel).off, 4);
    assert.equal(linkAt(d.doc, C(d, 0, 2)), null);
    assert.equal(linkAt(d.doc, SEL(d, 0, 3, 0, 5)), null);
    assert.equal(linkAt(d.doc, SEL(d, 0, 0, 1, 0)), null);
    assert.equal(linkAt(d.doc, null), null);
  });
  it('edit the text: one run in the format of the first, address ' +
    'and tip as they were', () => {
    const d = linked();
    const rels = d.doc.rels;
    step(d, (t) => editLink(d, t, C(d, 0, 5), {text: 'TWO!',
      address: 'https://a.org/', tip: 'T'}));
    const x = link(d);
    assert.equal(x.text, 'TWO!');
    assert.equal(kids(x).length, 1);
    assert.equal(rStyleOf(kids(x)[0]), 'Hyperlink');
    assert.ok(kids(x)[0].children[0].children.some((c) =>
      c.name === 'w:b'));
    assert.equal(d.doc.rels, rels, 'no new relationship');
  });
  it('edit the address: a new relationship (the old kept); a ' +
    'bookmark; back to a URL', () => {
    const d = linked();
    const old = d.doc.rels.at(-1);
    step(d, (t) => editLink(d, t, C(d, 0, 5), {address: 'ftp://f.org/'}));
    let at = Object.fromEntries(link(d).node.attrs);
    const nu = d.doc.rels.at(-1);
    assert.equal(nu.target, 'ftp://f.org/');
    assert.equal(at['r:id'], nu.id);
    assert.ok(d.doc.rels.includes(old), 'old relationship stays');
    assert.equal(link(d).text, 'two', 'text kept');
    step(d, (t) => editLink(d, t, C(d, 0, 5), {address: '#Top'}));
    at = Object.fromEntries(link(d).node.attrs);
    assert.equal(at['w:anchor'], 'Top');
    assert.equal(at['r:id'], undefined);
    step(d, (t) => editLink(d, t, C(d, 0, 5), {address: 'www.z.org'}));
    at = Object.fromEntries(link(d).node.attrs);
    assert.equal(at['w:anchor'], undefined);
    assert.equal(d.doc.rels.find((q) => q.id === at['r:id']).target,
      'http://www.z.org');
  });
  it('edit the ScreenTip: set, changed, removed; nothing changed: ' +
    'no step', () => {
    const d = linked();
    step(d, (t) => editLink(d, t, C(d, 0, 5), {tip: 'New tip'}));
    assert.equal(linkInfo(d.doc, link(d)).tip, 'New tip');
    step(d, (t) => editLink(d, t, C(d, 0, 5), {tip: ''}));
    assert.equal(Object.fromEntries(link(d).node.attrs)['w:tooltip'],
      undefined);
    const n = d.undoDepth, before = d.doc.sections[0].blocks[0];
    const out = editLink(d, new Typing(d), C(d, 0, 5), {text: 'two',
      address: 'https://a.org/', tip: ''});
    assert.ok(out.sel);
    assert.equal(d.undoDepth, n);
    assert.equal(d.doc.sections[0].blocks[0], before);
  });
  it('edit refusals: no link, bad address, empty text and address', () => {
    const d = linked();
    refused(d, (t) => editLink(d, t, C(d, 0, 1), {text: 'x'}), /no link/);
    refused(d, (t) => editLink(d, t, C(d, 0, 5),
      {address: 'javascript:void(0)'}), /not allowed/);
    refused(d, (t) => editLink(d, t, C(d, 0, 5), {address: ''}));
  });
  it('remove unwraps exactly: the runs and their rPr as before the ' +
    'link, selected', () => {
    const d = fmtDoc();
    const before = structuredClone(P(d, 0));
    insertLink(d, new Typing(d), SEL(d, 0, 2, 0, 10),
      {address: 'www.x.org'});
    const out = step(d, (t) => removeLink(d, t, SEL(d, 0, 2, 0, 3)));
    const q = P(d, 0);
    assert.equal(q.text, before.text);
    assert.ok(deepEqual(q.runs, before.runs), JSON.stringify(q.runs));
    assert.deepEqual(q.inlines, {});
    assert.deepEqual([out.sel.anchor.off, out.sel.head.off], [2, 10]);
    insertLink(d, new Typing(d), SEL(d, 0, 0, 0, 3),
      {address: 'www.x.org'});
    const o2 = removeLink(d, new Typing(d), C(d, 0, 1));
    assert.deepEqual([o2.sel.anchor.off, o2.sel.head.off], [3, 3]);
    refused(d, (t) => removeLink(d, t, C(d, 0, 1)), /no link/);
  });
  it('remove keeps what the link held: other styles, items, a field', () => {
    const xml = p(r('a') + '<w:hyperlink r:id="rId9" w:history="1">' +
      '<w:r><w:rPr><w:rStyle w:val="Emph"/></w:rPr><w:t>b</w:t></w:r>' +
      '<w:bookmarkStart w:id="1" w:name="m"/>' +
      '<w:r><w:tab/><w:t>c</w:t></w:r></w:hyperlink>' + r('d'));
    return buildDocx({'word/document.xml': documentXml(xml)},
      {docRels: [['rId9', REL('hyperlink'), 'http://x.org/',
        'External']]}).then(readDocx).then((doc) => {
      const d = new Document(doc);
      step(d, (t) => removeLink(d, t, C(d, 0, 2)));
      const q = P(d, 0);
      assert.equal(q.text, 'ab' + O + '\tcd');
      assert.equal(q.runs.find((x) => x.start === 1).rStyle, 'Emph');
      assert.equal(q.inlines[2].node.name, 'w:bookmarkStart');
      assert.deepEqual(findBookmark(d.doc, 'm'), {id: q.id, off: 2});
    });
  });
  it('a link whose r:id is missing shows an empty address and can be ' +
    'given one', async () => {
    const xml = p(r('a') + '<w:hyperlink r:id="rId77"><w:r><w:t>gone' +
      '</w:t></w:r></w:hyperlink>');
    const doc = await readDocx(await buildDocx({'word/document.xml':
      documentXml(xml)}));
    const d = new Document(doc);
    const x = link(d);
    assert.deepEqual(linkInfo(d.doc, x), {text: 'gone', address: '',
      tip: ''});
    assert.equal(linkUrl(d.doc)(x), null);
    step(d, (t) => editLink(d, t, C(d, 0, 2), {text: 'gone',
      address: 'https://fixed.org/', tip: ''}));
    assert.equal(linkInfo(d.doc, link(d)).address, 'https://fixed.org/');
    assert.equal(linkUrl(d.doc)(link(d)), 'https://fixed.org/');
  });
});

describe('links written and read back', () => {
  it('saved: the link, its relationship and style read back; ' +
    'ClipLinks finds the URL', async () => {
    const d = fmtDoc();
    insertLink(d, new Typing(d), SEL(d, 0, 4, 0, 8),
      {address: 'https://example.com/x y', tip: 'Tip'});
    insertLink(d, new Typing(d), SEL(d, 1, 0, 1, 6), {address: '#m'});
    const bytes = await write(d.doc);
    const back = await readDocx(bytes);
    const x = Object.values(back.sections[0].blocks[0].inlines)[0];
    assert.ok(isLink(x));
    assert.equal(x.text, 'twot');
    assert.deepEqual(linkInfo(back, x), {text: 'twot',
      address: 'https://example.com/x%20y', tip: 'Tip'});
    assert.equal(linkUrl(back)(x), 'https://example.com/x%20y');
    assert.ok(deepEqual(back.sections[0].blocks[0].inlines,
      d.doc.sections[0].blocks[0].inlines), 'node as made');
    assert.equal(back.styles.styles.get('Hyperlink').rPr.color, '0563C1');
    const rel = back.rels.find((q) => q.target ===
      'https://example.com/x%20y');
    assert.equal(rel.mode, 'External');
    const y = Object.values(back.sections[0].blocks[1].inlines)[0];
    assert.equal(linkInfo(back, y).address, '#m');
  });
  it('a Strict document gets a Strict relationship type', async () => {
    const doc = await readDocx(await strictDocx());
    const d = new Document(doc);
    const k = d.doc.sections[0].blocks.findIndex((b) => b.type === 'p' &&
      b.text === 'strict');
    insertLink(d, new Typing(d), SEL(d, k, 0, k, 6),
      {address: 'www.x.org'});
    const rel = d.doc.rels.at(-1);
    assert.match(rel.type, /^http:\/\/purl\.oclc\.org\/ooxml\//);
    const back = await readDocx(await write(d.doc));
    const x = Object.values(back.sections[0].blocks[k].inlines)
      .find(isLink);
    assert.equal(linkInfo(back, x).address, 'http://www.x.org');
  });
});

describe('BookmarkFind: bookmarks for links', () => {
  const start = (name) => ({kind: 'raw', level: 'p', node: {name:
    'w:bookmarkStart', attrs: [['w:id', '1'], ['w:name', name]],
  children: []}});
  it('names in order, once, hidden only when asked; found by name', () => {
    const tbl = {type: 'opaque', node: {name: 'w:tbl', attrs: [],
      children: [start('InTable').node]}};
    const d = mk([[O + 'a' + O, {inlines: {0: start('Intro'),
      2: start('_Toc1')}}], tbl, [O, {inlines: {0: start('intro')}}],
    [O, {inlines: {0: start('__proto__')}}]]);
    assert.deepEqual(bookmarkNames(d.doc), ['Intro', 'InTable',
      '__proto__'].filter((n) => !n.startsWith('_')));
    assert.deepEqual(bookmarkNames(d.doc, {hidden: true}), ['Intro',
      '_Toc1', 'InTable', '__proto__']);
    assert.deepEqual(findBookmark(d.doc, 'Intro'), {id: P(d, 0).id,
      off: 0});
    assert.deepEqual(findBookmark(d.doc, 'intro'), {id: P(d, 2).id,
      off: 0}, 'the exact name first');
    assert.deepEqual(findBookmark(d.doc, 'INTRO'), {id: P(d, 0).id,
      off: 0});
    assert.equal(findBookmark(d.doc, 'InTable').off, 0);
    assert.ok(findBookmark(d.doc, 'InTable').id < 0, 'the table');
    assert.equal(findBookmark(d.doc, 'nope'), null);
    assert.equal(findBookmark(d.doc, ''), null);
    assert.equal(findBookmark(d.doc, null), null);
  });
});

describe('keys: Ctrl-K, and Cmd-K on a Mac', () => {
  it('Ctrl-K is hyperlink, a window command; nothing else has it', () => {
    assert.equal(keymap.lookup({code: 11, key: 'k', ctrl: true}),
      'hyperlink');
    assert.equal(keymap.lookup({code: 11, key: 'K', ctrl: true,
      shift: true}), null);
    assert.equal(keymap.labelFor('hyperlink'), 'Ctrl+K');
    assert.ok(WINDOW.has('hyperlink'));
    assert.equal(keymap.row('hyperlink').menu, 'Window');
  });
  it('Cmd-K reaches us as Ctrl-K on a Mac (not elsewhere)', () => {
    assert.ok(CMD.has('k'));
    const ev = {code: 107, key: 'k', shift: false, ctrl: false,
      alt: false, domEvent: {metaKey: true, ctrlKey: false,
        altKey: false}};
    assert.equal(keymap.lookup(macKey(ev, true)), 'hyperlink');
    assert.equal(macKey(ev, false), ev);
    assert.equal(macLabel('Ctrl+K', true), 'Cmd+K');
    assert.equal(macLabel('Ctrl+K', false), 'Ctrl+K');
  });
});

describe('review fixes', () => {
  it('a selection with spaces at its ends, its text unchanged in the ' +
    'box: the runs are kept exactly, and Remove gives them back', () => {
    const d = fmtDoc();
    const before = structuredClone(P(d, 0));
    step(d, (t) => insertLink(d, t, SEL(d, 0, 3, 0, 8),
      {text: ' twot', address: 'www.x.org'}));
    const x = link(d);
    assert.equal(x.text, ' twot', 'the space kept');
    const rs = kids(x).filter((k) => k.name === 'w:r');
    assert.equal(rs.length, 2, 'plain and bold runs, not merged');
    removeLink(d, new Typing(d), C(d, 0, 4));
    assert.ok(deepEqual(P(d, 0).runs, before.runs));
    assert.equal(P(d, 0).text, before.text);
  });
  it('a tip-only edit of a link whose text has spaces at its ends ' +
    'leaves its children as they are', () => {
    const d = fmtDoc();
    insertLink(d, new Typing(d), SEL(d, 0, 3, 0, 8),
      {address: 'www.x.org'});
    const kids0 = structuredClone(link(d).node.children);
    step(d, (t) => editLink(d, t, C(d, 0, 4), {text: ' twot',
      address: 'http://www.x.org', tip: 'Tip'}));
    assert.ok(deepEqual(link(d).node.children, kids0),
      'children untouched');
    assert.equal(linkInfo(d.doc, link(d)).tip, 'Tip');
  });
  it('a tip with spaces at its ends, untouched: no change, no step',
    async () => {
      const xml = p(r('a') + '<w:hyperlink r:id="rId9" w:tooltip=" sp ">' +
        '<w:r><w:t xml:space="preserve"> b </w:t></w:r></w:hyperlink>');
      const doc = await readDocx(await buildDocx({'word/document.xml':
        documentXml(xml)}, {docRels: [['rId9', REL('hyperlink'),
        'http://x.org/', 'External']]}));
      const d = new Document(doc);
      const n = d.undoDepth, b0 = P(d, 0);
      const out = editLink(d, new Typing(d), C(d, 0, 2), {text: ' b ',
        address: 'http://x.org/', tip: ' sp '});
      assert.ok(out.sel);
      assert.equal(d.undoDepth, n);
      assert.equal(P(d, 0), b0);
    });
  it('#names with U+FFFC, non-characters or controls are refused; ' +
    'such bookmarks are not offered', () => {
    for (const s of ['#a\uFFFC', '#a\uFFFE', '#\uFDD0x', '#a\uFFFF',
      '#a\u{1FFFE}', '#a\uFFFD', '#a\u0085', '#a\u200B\u0000'])
      assert.ok(parseAddress(s).error, JSON.stringify(s));
    assert.ok(checkAnchor('Caf\u00e9_1') === null);
    const start = (name) => ({kind: 'raw', level: 'p', node: {name:
      'w:bookmarkStart', attrs: [['w:id', '1'], ['w:name', name]],
    children: []}});
    const d = mk([[O + O + O, {inlines: {0: start('Good'),
      1: start('Bad\uFFFC'), 2: start('Odd\uFDD0')}}]]);
    assert.deepEqual(bookmarkNames(d.doc), ['Good', 'Bad\uFFFC',
      'Odd\uFDD0']);
    assert.deepEqual(linkNames(d.doc), ['Good']);
    refused(d, (t) => insertLink(d, t, C(d, 0, 3),
      {anchor: 'Bad\uFFFC'}));
  });
  it('linkUnder: the link under the pointer, not the one next to the ' +
    'caret the click gives', () => {
    const lk = (t) => ({kind: 'raw', level: 'p', text: t, node: {name:
      'w:hyperlink', attrs: [['w:anchor', t]], children: []}});
    const d = mk([['x' + O + O + 'y', {inlines: {1: lk('aaaa'),
      2: lk('bbbb')}}]]);
    const L = new DocLayout(d.doc, tm());
    L.layout(800);
    const id = P(d, 0).id;
    const c1 = L.caretRect({id, off: 2}), c2 = L.caretRect({id, off: 3});
    const y = c1.y + c1.h / 2;
    // left half of the second link: the hit gives offset 2, whose
    // link before it is the first one
    const hit = L.hitTest(c1.x + 4, y);
    assert.equal(hit.pos.off, 2);
    assert.equal(linkAt(d.doc, {anchor: hit.pos, head: hit.pos}).off, 1);
    assert.equal(linkUnder(L, c1.x + 4, y).off, 2);
    assert.equal(linkUnder(L, c1.x - 4, y).off, 1);
    assert.equal(linkUnder(L, c2.x + 4, y), null, 'on "y"');
    assert.equal(linkUnder(L, L.caretRect({id, off: 0}).x + 2, y), null);
    assert.equal(linkUnder(L, c1.x + 4, -50), null);
  });
});
