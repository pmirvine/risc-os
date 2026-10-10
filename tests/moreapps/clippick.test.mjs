// ClipPick: what a paste puts in (the exact copy, HTML read, or plain
// text); ClipLinks: a hyperlink's URL from the document's
// relationships, for the HTML other programs get; ClipDom: ClipRead's
// parser from an injected DOMParser.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {pick, samePlain, MAX_TEXT, cutShort}
  from '../../tools/moreapps/!Word/ClipPick';
import {linkUrl} from '../../tools/moreapps/!Word/ClipLinks';
import {parserOf} from '../../tools/moreapps/!Word/ClipDom';
import {ClipStore, MARK} from '../../tools/moreapps/!Word/ClipStore';
import {toHtml} from '../../tools/moreapps/!Word/ClipHtml';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {mk, SEL, O} from './edit-docs.mjs';
import {parseHtml} from './html-fake.mjs';

const P = (text) => ({type: 'p', text, runs: text ? [{start: 0,
  end: text.length, rPr: {b: true, extra: []}}] : [], inlines: {},
  pPr: {extra: []}});
const tag = (t) => MARK + t + '-->';

describe('ClipPick.samePlain', () => {
  it('equal after the paste\'s cleaning (CR LF, controls, U+FFFC)',
    () => {
      assert.ok(samePlain('a\nb', 'a\nb'));
      assert.ok(samePlain('a\r\nb', 'a\nb'));
      assert.ok(samePlain('a\nb', 'a\r\nb'));
      assert.ok(samePlain('a\rb', 'a\nb'));
      assert.ok(samePlain('ab', 'a\u0007b'));
      assert.ok(samePlain('ab', 'a\ufffcb'));
      assert.ok(samePlain('a\tb', 'a\tb'));
      assert.ok(!samePlain('a b', 'a\tb'));
      assert.ok(!samePlain('ab', 'abc'));
      assert.ok(!samePlain('', 'a'));
      assert.ok(!samePlain(undefined, 'a'));
    });
  it('the paste\'s text is cut at MAX_TEXT: the stored text too', () => {
    const long = 'x'.repeat(MAX_TEXT + 50);
    assert.equal(MAX_TEXT, 100000);
    assert.ok(samePlain(long.slice(0, MAX_TEXT), long));
    assert.ok(!samePlain(long.slice(0, MAX_TEXT - 1), long));
    // never half a surrogate pair
    const e = 'x'.repeat(MAX_TEXT - 1) + '\u{1F600}';
    assert.ok(samePlain('x'.repeat(MAX_TEXT - 1), e));
  });
});

describe('ClipPick.pick', () => {
  const setup = () => {
    const store = new ClipStore();
    const blocks = [P('one'), P('two')];
    const token = store.put({blocks, styleNames: new Map(),
      plain: 'one\ntwo'}, 'k1');
    return {store, blocks, token};
  };
  it('the stored copy when the token and the text match', () => {
    const {store, blocks, token} = setup();
    const html = tag(token) + '<p>one</p><p>two</p>';
    const r = pick({text: 'one\r\ntwo', html},
      {store, docKey: 'k1', parseHtml});
    assert.equal(r.route, 'exact');
    assert.equal(r.blocks, blocks);
    assert.equal(r.opts.sameDoc, true);
    const r2 = pick({text: 'one\ntwo', html},
      {store, docKey: 'k2', parseHtml});
    assert.equal(r2.route, 'exact');
    assert.equal(r2.opts.sameDoc, false, 'another document');
  });
  it('stale token: the text changed elsewhere, the HTML is read', () => {
    const {store, token} = setup();
    const html = tag(token) + '<p>NEW</p>';
    const r = pick({text: 'NEW', html}, {store, docKey: 'k1',
      parseHtml});
    assert.equal(r.route, 'html');
    assert.deepEqual(r.blocks.map((b) => b.text), ['NEW']);
    assert.equal(r.opts.sameDoc, false);
  });
  it('a token the store does not hold, or no text: the HTML', () => {
    const {store, token} = setup();
    const r = pick({text: 'one\ntwo', html: tag('0123456789abcdef') +
      '<p><b>one</b></p><p>two</p>'}, {store, docKey: 'k1', parseHtml});
    assert.equal(r.route, 'html');
    assert.equal(r.blocks[0].runs[0].rPr.b, true);
    const r2 = pick({text: '', html: tag(token) + '<p>one</p>'},
      {store, docKey: 'k1', parseHtml});
    assert.equal(r2.route, 'html');
  });
  it('the token must be in the HTML (not only in the text)', () => {
    const {store, token} = setup();
    const r = pick({text: tag(token), html: ''}, {store, docKey: 'k1',
      parseHtml});
    assert.equal(r.route, 'plain');
    assert.equal(r.text, tag(token));
  });
  it('HTML that cannot be read: the text; nothing: null', () => {
    const store = new ClipStore();
    const bad = () => { throw new Error('parser'); };
    const r = pick({text: 'plain', html: '<p>x</p>'}, {store,
      docKey: 1, parseHtml: bad});
    assert.deepEqual([r.route, r.text], ['plain', 'plain']);
    const r2 = pick({text: 'plain', html: '<script>x</script>'},
      {store, docKey: 1, parseHtml});
    assert.equal(r2.route, 'plain', 'no text in the HTML');
    assert.equal(pick({text: '', html: ''}, {store, docKey: 1,
      parseHtml}), null);
    assert.equal(pick({text: '', html: '<img src=x>'}, {store,
      docKey: 1, parseHtml}), null);
    assert.equal(pick({}, {store, docKey: 1, parseHtml}), null);
    assert.equal(pick({text: 'p', html: '<p>h</p>'}, {store, docKey: 1,
      parseHtml: null}).route, 'plain', 'no parser');
  });
});

describe('ClipPick.pick: pictures (R10)', () => {
  const store = new ClipStore();
  const f = (type, size = 100) => ({type, size});
  const png = f('image/png');
  const go = (payload) => pick(payload, {store, docKey: 1, parseHtml});
  it('no text and a PNG file: the picture route', () => {
    const r = go({text: '', html: '<img src=x>', files: [png]});
    assert.deepEqual([r.route, r.file], ['picture', png]);
    for (const t of ['image/jpeg', 'image/gif']) {
      const x = f(t);
      assert.equal(go({text: '', html: '', files: [x]}).file, x);
    }
  });
  it('text with the file: the text (a spreadsheet\'s paste)', () => {
    const r = go({text: 'a\tb', html: '', files: [png]});
    assert.deepEqual([r.route, r.text], ['plain', 'a\tb']);
    assert.equal(go({text: 'a', html: '<p>a</p>', files: [png]})
      .route, 'html');
  });
  it('the exact copy comes first', () => {
    const s = new ClipStore();
    const t = s.put({blocks: [P('one')], styleNames: new Map(),
      plain: ''}, 'k1');
    const r = pick({text: '', html: tag(t) + '<p>one</p>',
      files: [png]}, {store: s, docKey: 'k1', parseHtml});
    assert.equal(r.route, 'exact');
  });
  it('other types or beyond the first 8: not a picture; over 20 MB: too big',
    () => {
      assert.equal(go({text: '', html: '', files: [f('image/svg+xml')]}),
        null);
      assert.equal(go({text: '', html: '', files: [f('image/bmp'),
        f('')]}), null);
      const big = f('image/png', 30 * 1024 * 1024);
      const r = go({text: '', html: '', files: [big]});
      assert.deepEqual([r.route, r.file, r.tooBig], ['picture', big,
        true]);
      assert.equal(go({text: '', html: '', files: [png]}).tooBig,
        false);
      const nine = Array.from({length: 8}, () => f('text/plain'));
      assert.equal(go({text: '', html: '', files: [...nine, png]}),
        null);
      const eight = nine.slice(1);
      assert.equal(go({text: '', html: '', files: [...eight, png]})
        .file, png);
      assert.equal(go({text: '', html: '', files: [f('image/svg+xml'),
        png]}).file, png, 'the first picture of the files');
    });
});

describe('ClipLinks.linkUrl', () => {
  const link = (attrs, name = 'w:hyperlink') => ({kind: 'raw',
    level: 'p', text: 'here', node: {name, attrs, children: []}});
  const rels = [
    {id: 'rId5', type: 'http://schemas.openxmlformats.org/' +
      'officeDocument/2006/relationships/hyperlink',
    target: 'https://example.com/a?b=1&c=2', mode: 'External'},
    {id: 'rId6', type: 'http://purl.oclc.org/ooxml/officeDocument/' +
      'relationships/hyperlink', target: 'mailto:a@example.com',
    mode: 'External'},
    {id: 'rId7', type: 'http://schemas.openxmlformats.org/' +
      'officeDocument/2006/relationships/hyperlink',
    target: 'javascript:alert(1)', mode: 'External'},
    {id: 'rId8', type: 'http://schemas.openxmlformats.org/' +
      'officeDocument/2006/relationships/image',
    target: 'https://example.com/i.png', mode: 'External'},
    {id: 'rId9', type: 'http://schemas.openxmlformats.org/' +
      'officeDocument/2006/relationships/hyperlink',
    target: 'other.docx'},
    {id: 'rId10', type: 'http://schemas.openxmlformats.org/' +
      'officeDocument/2006/relationships/hyperlink',
    target: 'https://exa mple.com/', mode: 'External'},
  ];
  const urlOf = linkUrl({rels});
  it('an external http, https or mailto hyperlink target', () => {
    assert.equal(urlOf(link([['r:id', 'rId5']])),
      'https://example.com/a?b=1&c=2');
    assert.equal(urlOf(link([['rel:id', 'rId6']])),
      'mailto:a@example.com', 'any prefix but w');
  });
  it('nothing for anything else', () => {
    assert.equal(urlOf(link([['r:id', 'rId7']])), null, 'javascript:');
    assert.equal(urlOf(link([['r:id', 'rId8']])), null, 'not a link');
    assert.equal(urlOf(link([['r:id', 'rId9']])), null, 'internal');
    assert.equal(urlOf(link([['r:id', 'rId10']])), null, 'space');
    assert.equal(urlOf(link([['r:id', 'rId99']])), null, 'no rel');
    assert.equal(urlOf(link([['w:anchor', 'x']])), null, 'anchor');
    assert.equal(urlOf(link([['w:id', 'rId5']])), null, 'w:id');
    assert.equal(urlOf(link([['r:id', 'rId5']], 'w:fldSimple')), null);
    assert.equal(urlOf({kind: 'tab'}), null);
    assert.equal(urlOf(null), null);
    assert.equal(linkUrl({rels: null})(link([['r:id', 'rId5']])), null);
    assert.equal(linkUrl({})(link([['r:id', 'rId5']])), null);
  });
  it('reaches ClipHtml as <a href> (escaped)', () => {
    const lk = link([['r:id', 'rId5']]);
    const d = mk([['a' + O + 'b', {inlines: {1: lk}}]]);
    d.doc.rels = rels;
    const s = slice(d.doc, SEL(d, 0, 0, 0, 3));
    const h = toHtml(d.doc, s, {urlOf: linkUrl(d.doc)});
    assert.match(h, /<a href="https:\/\/example\.com\/a\?b=1&amp;c=2">here<\/a>/);
    assert.ok(!/<a /.test(toHtml(d.doc, s)), 'none without urlOf');
  });
});

describe('ClipDom.parserOf', () => {
  it('parses with the given DOMParser as text/html', () => {
    const calls = [];
    class DP {
      parseFromString(s, type) {
        calls.push([s, type]);
        return parseHtml(s);
      }
    }
    const parse = parserOf(DP);
    const root = parse('<p>x</p>');
    assert.deepEqual(calls, [['<p>x</p>', 'text/html']]);
    assert.equal(typeof root.childNodes, 'object');
  });
  it('no DOMParser: null; a parser that throws: it throws (ClipRead ' +
    'catches)', () => {
    assert.equal(parserOf(undefined), null);
    assert.equal(parserOf(null), null);
    class Bad { parseFromString() { throw new Error('no'); } }
    assert.throws(() => parserOf(Bad)('<p>'));
  });
});

describe('ClipPick.cutShort: whether the Wimp cut a paste\'s text', () => {
  const E = '\u{1F600}';
  for (const [what, text, want] of [
    ['99,999 characters', 'x'.repeat(99999), false],
    ['100,000 characters', 'x'.repeat(100000), false],
    ['100,001 characters', 'x'.repeat(100001), true],
    ['an emoji ending at the cap', 'x'.repeat(99998) + E, false],
    ['an emoji across the cap', 'x'.repeat(99999) + E, true],
    ['CR LF counts as one', 'x'.repeat(99998) + '\r\n' + 'y', false],
    ['a lone CR counts as one', 'x'.repeat(99999) + '\r', false],
    ['controls are dropped first', 'x'.repeat(100000) + '\u0007\u0001\u0085', false],
    ['a lone surrogate is one character', 'x'.repeat(99999) + '\ud800', false],
    ['tabs and new lines count', 'x'.repeat(99999) + '\t\n', true],
    ['5 MB', 'x'.repeat(5000000), true],
    ['nothing', '', false],
    ['not a string', null, false],
  ]) {
    it(what, () => assert.equal(cutShort(text), want));
  }
});
