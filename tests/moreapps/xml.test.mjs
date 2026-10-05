import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parseXml, serialize, esc, escAttr, el, text, find, findAll,
  attr, XmlError} from '../../tools/moreapps/!WimpLib/Xml';

const bad = (src, code, line) => {
  assert.throws(() => parseXml(src), (e) => {
    assert.ok(e instanceof XmlError, String(e));
    assert.equal(e.code, code);
    if (line !== undefined) assert.equal(e.line, line);
    return true;
  });
};
const deep = (n) => '<a>'.repeat(n) + '</a>'.repeat(n);

const WML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/' +
  'wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.' +
  'org/markup-compatibility/2006" xmlns:w14="http://schemas.microsoft.' +
  'com/office/word/2010/wordml" mc:Ignorable="w14 w15"><w:body>' +
  '<w:p w14:paraId="1A2B3C4D"><w:pPr><w:jc w:val="center"/></w:pPr>' +
  '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> Hello &amp; ' +
  'goodbye </w:t></w:r><w:r><w:t>a &lt; b</w:t></w:r></w:p>' +
  '<!-- a note --><w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
  '</w:sectPr></w:body></w:document>';

describe('Xml', () => {
  it('parses elements attributes text in order', () => {
    const {decl, root} = parseXml('<a x="1" y=\'2\'>hi<b/>there<c>z</c></a>');
    assert.equal(decl, null);
    assert.equal(root.name, 'a');
    assert.deepEqual(root.attrs, [['x', '1'], ['y', '2']]);
    assert.equal(root.children.length, 4);
    assert.equal(root.children[0], 'hi');
    assert.deepEqual(root.children[1], {name: 'b', attrs: [], children: []});
    assert.equal(root.children[2], 'there');
    assert.equal(text(root), 'hithere' + 'z');
  });

  it('reads the declaration', () => {
    const r = parseXml('<?xml version="1.0"?>\n<a/>');
    assert.equal(r.decl, 'xml version="1.0"');
  });

  it('keeps prefixes and attribute order', () => {
    const {root} = parseXml(
      '<w:p z="1" a="2" xmlns:w="u" w:b="3"><w:r/></w:p>');
    assert.equal(root.name, 'w:p');
    assert.deepEqual(root.attrs.map((a) => a[0]),
      ['z', 'a', 'xmlns:w', 'w:b']);
    assert.equal(root.children[0].name, 'w:r');
    assert.equal(attr(root, 'a'), '2');
    assert.equal(attr(root, 'nope'), undefined);
  });

  it('entities and character references', () => {
    const {root} = parseXml(
      '<a t="&quot;&apos;">&amp; &lt; &gt; &quot; &apos; &#65; ' +
      '&#x1F600;</a>');
    assert.equal(root.children[0], '& < > " \' A \u{1F600}');
    assert.equal(attr(root, 't'), '"\'');
  });

  it('numeric reference edge cases', () => {
    bad('<a>&#0;</a>', 'malformed');
    bad('<a>&#xD800;</a>', 'malformed');
    bad('<a>&#x110000;</a>', 'malformed');
    bad('<a>&#1;</a>', 'malformed');
    bad('<a>&#;</a>', 'malformed');
    bad('<a>&#xZ;</a>', 'malformed');
    bad('<a>&amp</a>', 'malformed');
    assert.equal(parseXml('<a>&#x10FFFF;</a>').root.children[0],
      '\u{10FFFF}');
    assert.equal(parseXml('<a>&#10;</a>').root.children[0], '\n');
  });

  it('CDATA becomes text, merged with neighbours', () => {
    const {root} = parseXml('<a>x<![CDATA[<&>]]>y</a>');
    assert.deepEqual(root.children, ['x<&>y']);
  });

  it('comments and PIs kept as nodes', () => {
    const {root} = parseXml('<!-- gone --><a><!-- c --><?t d?>x</a><?p q?>');
    assert.deepEqual(root.children, [{comment: ' c '}, {pi: 't d'}, 'x']);
  });

  it('normalises line endings and attribute whitespace', () => {
    const {root} = parseXml('<a v="1\t2\n3\r\n4&#10;5">a\r\nb\rc</a>');
    assert.equal(attr(root, 'v'), '1 2 3 4\n5');
    assert.equal(root.children[0], 'a\nb\nc');
  });

  it('keeps whitespace-only text nodes', () => {
    const {root} = parseXml('<a> <b/>\n</a>');
    assert.deepEqual(root.children.map((c) => typeof c === 'string'),
      [true, false, true]);
  });

  it('BOM stripped', () => {
    assert.equal(parseXml('\uFEFF<a/>').root.name, 'a');
    assert.equal(parseXml('\uFEFF<?xml version="1.0"?><a/>').decl,
      'xml version="1.0"');
  });

  it('round trip: serialize(parse(x)) equals x for WordprocessingML', () => {
    const {decl, root} = parseXml(WML);
    assert.equal(serialize(root, {decl}), WML);
    const again = parseXml(serialize(root, {decl}));
    assert.deepEqual(again.root, root);
    assert.equal(attr(root, 'mc:Ignorable'), 'w14 w15');
    const t = find(find(find(find(root, 'w:body'), 'w:p'), 'w:r'), 'w:t');
    assert.equal(attr(t, 'xml:space'), 'preserve');
    assert.equal(text(t), ' Hello & goodbye ');
    assert.deepEqual(root.attrs.map((a) => a[0]),
      ['xmlns:w', 'xmlns:mc', 'xmlns:w14', 'mc:Ignorable']);
  });

  it('<!DOCTYPE -> XmlError dtd', () => {
    bad('<!DOCTYPE a><a/>', 'dtd', 1);
    bad('<?xml version="1.0"?>\n<!DOCTYPE a [<!ENTITY e "x">]><a/>', 'dtd', 2);
  });

  it('XXE and entity bombs are rejected quickly', () => {
    const xxe = '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM ' +
      '"file:///etc/passwd">]><foo>&xxe;</foo>';
    let t0 = performance.now();
    bad(xxe, 'dtd', 1);
    const lol = '<!DOCTYPE lolz [<!ENTITY lol "lol">' +
      '<!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">' +
      '<!ENTITY lol9 "&lol8;&lol8;&lol8;">]><lolz>&lol9;</lolz>';
    bad(lol, 'dtd');
    bad('<lolz>&lol9;</lolz>', 'entity');
    assert.ok(performance.now() - t0 < 200);
  });

  it('custom entity reference &foo; -> XmlError entity', () => {
    bad('<a>x &foo; y</a>', 'entity', 1);
    bad('<a b="&foo;"/>', 'entity');
    bad('<a>&nbsp;</a>', 'entity');
  });

  it('depth over 256 -> XmlError depth', () => {
    assert.equal(parseXml(deep(256)).root.name, 'a');
    bad(deep(257), 'depth');
    bad(deep(100000), 'depth');
  });

  it('malformed documents give XmlError with a 1-based line', () => {
    bad('<a>\n<b>\n</a>', 'malformed', 3);
    bad('<a>\n<b/>', 'malformed', 2);
    bad('<a', 'malformed', 1);
    bad('<a b="1" b="2"/>', 'malformed', 1);
    bad('<a>\n\n<b x="1" x="2"/></a>', 'malformed', 3);
    bad('', 'malformed');
    bad('   ', 'malformed');
    bad('<?xml version="1.0"?>', 'malformed');
    bad('text<a/>', 'malformed', 1);
    bad('<a/>\ntext', 'malformed', 2);
    bad('<a/><b/>', 'malformed');
    bad('<a/></a>', 'malformed');
    bad('</a>', 'malformed');
    bad('<1a/>', 'malformed');
    bad('<a 1="x"/>', 'malformed');
    bad('<a b=1/>', 'malformed');
    bad('<a b/>', 'malformed');
    bad('<a b="x"c="y"/>', 'malformed');
    bad('<a b="x', 'malformed');
    bad('<a b="<"/>', 'malformed');
    bad('<a><!-- x </a>', 'malformed');
    bad('<a><!-- x -- y --></a>', 'malformed');
    bad('<a><!-- x ---></a>', 'malformed');
    bad('<a><![CDATA[ x </a>', 'malformed');
    bad('<a><? x </a>', 'malformed');
    bad('<a><?xml v?></a>', 'malformed');
    bad('<a><!foo></a>', 'malformed');
    bad('<a>]]></a>', 'malformed');
    bad('<a>\u0000</a>', 'malformed');
    bad('<a>\n\u0001</a>', 'malformed', 2);
    bad('<a>\uFFFF</a>', 'malformed');
    bad('<a>\uD800</a>', 'malformed');
    bad('<a b="\u0008"/>', 'malformed');
  });

  it('accepts a valid surrogate pair and non-ASCII names', () => {
    assert.equal(parseXml('<a>\u{1F600}</a>').root.children[0], '\u{1F600}');
    assert.equal(parseXml('<\u00E9l\u00E9ment/>').root.name,
      '\u00E9l\u00E9ment');
  });

  it('serialize escapes and self-closes', () => {
    const n = el('a', {q: 'x"<>&\t\n\r\'', skip: undefined, n: null},
      'a & b < c > d', el('e'), {comment: ' c '}, {pi: 't d'},
      el('f', [['k', 'v'], ['gone', undefined]], ['one', ['two']]));
    assert.equal(serialize(n),
      '<a q="x&quot;&lt;&gt;&amp;&#9;&#10;&#13;\'">' +
      'a &amp; b &lt; c &gt; d<e/><!-- c --><?t d?>' +
      '<f k="v">onetwo</f></a>');
    assert.equal(serialize(el('r'), {decl: 'xml version="1.0"'}),
      '<?xml version="1.0"?>\n<r/>');
    assert.equal(esc('<&>"'), '&lt;&amp;&gt;"');
    assert.equal(escAttr('"\t'), '&quot;&#9;');
    assert.equal(serialize(n), serialize(n));
  });

  it('attribute values with special characters round trip', () => {
    const n = el('a', {v: 'a\tb\nc\rd "e" <&>'});
    assert.deepEqual(parseXml(serialize(n)).root, n);
  });

  it('find findAll attr text', () => {
    const {root} = parseXml('<a><b i="1"/><c/><b i="2">t<d>u</d></b></a>');
    assert.equal(attr(find(root, 'b'), 'i'), '1');
    assert.equal(find(root, 'zz'), null);
    assert.deepEqual(findAll(root, 'b').map((b) => attr(b, 'i')), ['1', '2']);
    assert.equal(text(root), 'tu');
  });

  it('100k-element document parses fast', () => {
    const doc = '<r>' + '<w:p a="1">t</w:p>'.repeat(100000) + '</r>';
    const t0 = performance.now();
    const {root} = parseXml(doc);
    const ms = performance.now() - t0;
    console.log('    parsed 100k elements in ' + ms.toFixed(0) + ' ms');
    assert.equal(root.children.length, 100000);
    assert.ok(ms < 3000, ms + ' ms');
    const s0 = performance.now();
    assert.equal(serialize(root).length, doc.length);
    console.log('    serialized in ' + (performance.now() - s0).toFixed(0) +
      ' ms');
  });

  it('linear on hostile shapes', () => {
    const t0 = performance.now();
    for (const doc of ['<a>' + '&amp;'.repeat(200000) + '</a>',
      '<a>' + '<!-- x -->'.repeat(50000) + '</a>',
      '<a ' + 'x'.repeat(200000) + '="1"/>',
      '<a>' + '<![CDATA[x]]>'.repeat(50000) + '</a>',
      '<a>' + '<'.repeat(100000) + '</a>',
      '<a>' + '&'.repeat(100000) + '</a>',
      '<a b="' + '&'.repeat(100000) + '"/>']) {
      try { parseXml(doc); } catch (e) { assert.ok(e instanceof XmlError); }
    }
    assert.ok(performance.now() - t0 < 3000);
  });

  it('mini fuzz: only XmlError or a result, and fast', () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF);
    const t0 = performance.now();
    const attempt = (src) => {
      try {
        const r = parseXml(src);
        serialize(r.root, {decl: r.decl});
      } catch (e) {
        assert.ok(e instanceof XmlError, String(e && e.stack));
        assert.ok(e.line >= 1);
      }
    };
    for (let i = 0; i <= WML.length; i++) attempt(WML.slice(0, i));
    const chars = '<>&;"\'/=!?-[]# \n\u0000a\uD800';
    for (let k = 0; k < 300; k++) {
      const a = WML.split('');
      for (let f = 0; f < 1 + rnd() % 4; f++)
        a[rnd() % a.length] = chars[rnd() % chars.length];
      attempt(a.join(''));
    }
    assert.ok(performance.now() - t0 < 3000);
  });
  it('esc keeps CR: text round trip is stable', () => {
    const {root} = parseXml('<a>x&#13;y</a>');
    assert.equal(root.children[0], 'x\ry');
    const out = serialize(root);
    assert.equal(out, '<a>x&#13;y</a>');
    assert.equal(parseXml(out).root.children[0], 'x\ry');
    assert.equal(esc('\r'), '&#13;');
  });

  it('prolog and epilog comments and PIs survive', () => {
    const src = '<?xml version="1.0"?>\n<?mso-contentType x?>\n' +
      '<!-- top --><a>t</a><!-- end --><?after y?>';
    const r = parseXml(src);
    assert.deepEqual(r.before, [{pi: 'mso-contentType x'},
      {comment: ' top '}]);
    assert.deepEqual(r.after, [{comment: ' end '}, {pi: 'after y'}]);
    const out = serialize(r.root, r);
    assert.ok(out.indexOf('<?mso-contentType x?>') <
      out.indexOf('<a>'));
    assert.ok(out.indexOf('<!-- end -->') > out.indexOf('</a>'));
    const r2 = parseXml(out);
    assert.deepEqual(r2, r);
    assert.equal(serialize(r2.root, r2), out);
    assert.deepEqual(parseXml('<a/>').before, []);
    assert.deepEqual(parseXml('<a/>').after, []);
    assert.equal(serialize(r.root), '<a>t</a>');
  });

  it('XML declaration is validated', () => {
    for (const d of ['<?xml version="1.0"?>', "<?xml version='1.1' " +
      'encoding="UTF-8" standalone="yes"?>',
      '<?xml version="1.0" standalone="no" ?>'])
      assert.ok(parseXml(d + '<a/>').decl);
    for (const d of ['<?xml version="1.0" encoding="UTF-8" sta<ndalone' +
      '="yes"?>', '<?xml?>', '<?xml encoding="UTF-8"?>',
      '<?xml version="2.0"?>', '<?xml version="1.0" standalone="yes" ' +
      'encoding="UTF-8"?>', '<?xml version="1.0" standalone="maybe"?>',
      '<?xml version="1.0" junk?>', '<?xml version=1.0?>'])
      bad(d + '<a/>', 'malformed', 1);
  });

  it('long numeric references are fine up to a bound', () => {
    assert.equal(parseXml('<a>&#00000000065;</a>').root.children[0], 'A');
    assert.equal(parseXml('<a>&#x0000000041;</a>').root.children[0], 'A');
    bad('<a>&#' + '1'.repeat(30) + ';</a>', 'malformed');
    bad('<a>&#' + '0'.repeat(100) + '65;</a>', 'malformed');
    bad('<a>&#x' + 'F'.repeat(30) + ';</a>', 'malformed');
  });

  it('el rejects a wrong attrs argument', () => {
    assert.throws(() => el('w:t', 'hello'), TypeError);
    assert.throws(() => el('w:p', el('w:r')), TypeError);
    assert.throws(() => el('w:p', {comment: 'x'}), TypeError);
    assert.equal(serialize(el('a', {name: 'n'})), '<a name="n"/>');
    assert.equal(serialize(el('w:p', null, el('w:r'), 'x')),
      '<w:p><w:r/>x</w:p>');
    assert.equal(serialize(el('w:p', undefined, 'x')), '<w:p>x</w:p>');
  });

  it('serialize refuses to write invalid XML', () => {
    const w = (n) => assert.throws(() => serialize(n),
      (e) => e instanceof XmlError && e.code === 'malformed');
    w(el('1a'));
    w(el('a b'));
    w(el('a', {'b c': '1'}));
    w(el('a', {'': '1'}));
    w(el('a', null, {comment: 'x--y'}));
    w(el('a', null, {comment: 'x-'}));
    w(el('a', null, {pi: 't ?> u'}));
    w(el('a', null, {pi: '1t u'}));
    w(el('a', null, 'x\u0000y'));
    w(el('a', null, 'x\u000By'));
    w(el('a', null, 'x\uFFFFy'));
    w(el('a', null, 'x\uFFFEy'));
    w(el('a', null, 'x\uD800y'));
    w(el('a', {v: 'x\u0008'}));
    w(el('a', null, {comment: 'x\u0001'}));
    assert.throws(() => serialize(el('a'), {before: [{comment: 'a--b'}]}),
      XmlError);
    assert.equal(serialize(el('a', {v: '\u{1F600}\t'}, 'ok\t\n')),
      '<a v="\u{1F600}&#9;">ok\t\n</a>');
  });
});
