// ClipRead: HTML from other programs (untrusted) -> clipboard blocks,
// through a whitelist walker over an injected DOM-like parser.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readHtml, readTree, LIMITS}
  from '../../tools/moreapps/!Word/ClipRead';
import {parseStyle} from '../../tools/moreapps/!Word/ClipCss';
import {checkContent} from '../../tools/moreapps/!Word/ModelCheck';
import {parseHtml, mkEl, mkText} from './html-fake.mjs';

const read = (h) => readHtml(h, parseHtml);
const texts = (h) => {
  const r = read(h);
  return r ? r.blocks.map((b) => b.text) : null;
};
/** The rPr of the run holding offset `at` of block k. */
const fmt = (r, k, at = 0) => {
  const b = r.blocks[k];
  const run = b.runs.find((x) => x.start <= at && at < x.end);
  return run.rPr;
};

describe('ClipRead: structure', () => {
  it('paragraphs, divs, br, whitespace collapsed', () => {
    assert.deepEqual(texts('<p>  a \n  b </p><div>c<br>d</div>e'),
      ['a b', 'c\nd', 'e']);
    assert.deepEqual(texts('x<p></p>y'), ['x', 'y']);
    assert.deepEqual(texts('<p><br></p><p>a<br><br></p>'), ['', 'a\n']);
    assert.deepEqual(texts('<p>a <b> b</b> c</p>'), ['a b c']);
  });
  it('&nbsp; is a space and is not collapsed; entities', () => {
    assert.deepEqual(texts('<p>a&nbsp;&nbsp; b&#x1F600;&amp;&lt;' +
      '&#233;</p>'), ['a   b\u{1F600}&<é']);
  });
  it('pre keeps white space; its lines are paragraphs', () => {
    assert.deepEqual(texts('<pre>  a\tb\n  c</pre>'), ['  a\tb', '  c']);
    assert.deepEqual(texts('<p style="white-space:pre-wrap">  x  </p>'),
      ['  x  ']);
  });
  it('headings: bold and size, pStyle Heading N with its name', () => {
    const r = read('<h2>Head</h2><p>body</p>');
    assert.equal(r.blocks[0].pStyle, 'Heading2');
    assert.deepEqual(fmt(r, 0), {b: true, sz: 26, extra: []});
    assert.equal(r.blocks[1].pStyle, undefined);
    assert.deepEqual(r.styleNames.get('Heading2'),
      {name: 'heading 2', type: 'paragraph'});
  });
  it('lists: items become ordinary paragraphs', () => {
    const r = read('<ul><li>one</li><li>two<ol><li>in</li></ol></li>' +
      '</ul>');
    assert.deepEqual(r.blocks.map((b) => b.text), ['one', 'two', 'in']);
    for (const b of r.blocks) assert.deepEqual(b.pPr, {extra: []});
  });
  it('tables flattened: cells tab-separated, rows paragraphs', () => {
    assert.deepEqual(texts('<table><tr><th>a</th><td><p>b</p><p>c</p>' +
      '</td></tr><tr><td>d</td><td></td><td>e</td></tr></table>'),
    ['a\tb c', 'd\t\te']);
  });
  it('text-align gives jc', () => {
    const r = read('<p style="text-align:center">a</p><p align="x">b' +
      '</p><div style="text-align:justify"><p>c</p></div>');
    assert.deepEqual(r.blocks.map((b) => b.pPr.jc),
      ['center', undefined, 'both']);
  });
  it('every block is valid content; rPr objects are shared', () => {
    const r = read('<p><b>a</b>b<b>c</b></p><p><b>d</b></p>');
    for (const b of r.blocks) checkContent(b, true);
    assert.equal(fmt(r, 0, 0), fmt(r, 1, 0));
    assert.deepEqual(r.blocks[0].inlines, {});
  });
});

describe('ClipRead: white space around preformatted text', () => {
  it('a space before pre-styled text keeps the text whole', () => {
    assert.deepEqual(texts('<p>a <span style="white-space:pre">x\ny' +
      '</span></p>'), ['a x', 'y']);
    assert.deepEqual(texts('<p>a <span style="white-space:pre">xy\nz' +
      '</span></p>'), ['a xy', 'z']);
  });
  it('<pre> after a trailing space and after a <br>', () => {
    assert.deepEqual(texts('a <pre>b\nc</pre>'), ['a', 'b', 'c']);
    assert.deepEqual(texts('<div>a <span style="white-space:pre-wrap">' +
      ' b\nc</span></div>'), ['a  b', 'c']);
    assert.deepEqual(texts('<p>a<br><span style="white-space:pre">' +
      'b\nc</span></p>'), ['a\nb', 'c']);
  });
  it('a collapsible space before <br> is dropped', () => {
    assert.deepEqual(texts('<p>a <br>b</p>'), ['a\nb']);
    assert.deepEqual(texts('<p>a&nbsp;<br>b</p>'), ['a \nb']);
  });
});

describe('ClipRead: inline formatting', () => {
  it('tags', () => {
    const r = read('<p><b>b</b><strong>s</strong><i>i</i><em>e</em>' +
      '<u>u</u><ins>n</ins><s>s</s><strike>k</strike><del>d</del>' +
      '<sup>p</sup><sub>q</sub><a href="javascript:x()">l</a></p>');
    const f = (k) => fmt(r, 0, k);
    assert.equal(f(0).b, true);
    assert.equal(f(1).b, true);
    assert.equal(f(2).i, true);
    assert.equal(f(3).i, true);
    assert.equal(f(4).u, 'single');
    assert.equal(f(5).u, 'single');
    for (const k of [6, 7, 8]) assert.equal(f(k).strike, true);
    assert.equal(f(9).vertAlign, 'superscript');
    assert.equal(f(10).vertAlign, 'subscript');
    assert.deepEqual(f(11), {extra: []});
    assert.ok(!JSON.stringify(r).includes('javascript'));
  });
  it('style: colour, family, size, weight, style, decoration', () => {
    const r = read('<p><span style="color:#f00;font-family:\'Times New ' +
      'Roman\',serif;font-size:14pt;font-weight:700;font-style:italic;' +
      'text-decoration:underline line-through;vertical-align:super">' +
      'x</span><span style="color:rgb(0, 128, 255);font-size:16px">' +
      'y</span><span style="color:#123456;font-size:2em">z</span></p>');
    assert.deepEqual(fmt(r, 0, 0), {b: true, i: true, u: 'single',
      strike: true, vertAlign: 'superscript', color: 'FF0000', sz: 28,
      rFonts: {ascii: 'Times New Roman', hAnsi: 'Times New Roman'},
      extra: []});
    assert.deepEqual(fmt(r, 0, 1), {color: '0080FF', sz: 24, extra: []});
    assert.deepEqual(fmt(r, 0, 2), {color: '123456', sz: 44, extra: []});
  });
  it('font element', () => {
    const r = read('<font color="#00ff00" size="5" face="Arial">x</font>');
    assert.deepEqual(fmt(r, 0), {color: '00FF00', sz: 36,
      rFonts: {ascii: 'Arial', hAnsi: 'Arial'}, extra: []});
  });
  it('hostile style values are ignored', () => {
    const bad = ['color:url(javascript:alert(1))',
      'color:expression(alert(1))', 'font-size:1e9px',
      'font-family:url(x)', 'font-family:"<script>"',
      'font-size:999999pt', 'color:#ggg', 'color:rgb(300,0,0)',
      'font-family:' + 'a'.repeat(65), 'font-weight:900x',
      'background:url(http://x)', 'font-family:expression(x)',
      'font-size:-5pt', 'color:#ff0000\\9'];
    for (const s of bad) {
      const p = parseStyle(s, 11);
      assert.equal(p.color, undefined, s);
      assert.equal(p.font, undefined, s);
      if (s.startsWith('font-size:999999')) assert.equal(p.sz, 800);
      else assert.equal(p.sz, undefined, s);
      assert.equal(p.b, undefined, s);
    }
    assert.equal(parseStyle('font-size:0.1pt', 11).sz, 2);
    for (const t of ['rgba(0,0,0,0)', 'rgba(255, 0, 0, 0.0)',
      'rgba(1,2,3,0%)', 'transparent', 'hsla(0,0%,0%,0)',
      'hsl(0,100%,50%)'])
      assert.equal(parseStyle('color:' + t, 11).color, undefined, t);
    assert.equal(parseStyle('color:rgba(255,0,0,0.5)', 11).color,
      'FF0000');
    assert.equal(parseStyle('color:rgba(0,0,255,50%)', 11).color,
      '0000FF');
    assert.equal(parseStyle('FONT-WEIGHT : BOLD !important', 11).b, true);
    assert.equal(parseStyle('font-weight:400', 11).b, false);
    assert.equal(parseStyle('x'.repeat(100000) + ';color:red', 11)
      .color, undefined);
  });
  it('event attributes and href are never kept', () => {
    const r = read('<p onclick="evil()" style="color:red" ' +
      'onmouseover="x"><a href="http://evil" onclick="y">t</a></p>');
    const s = JSON.stringify([...r.blocks]);
    for (const w of ['evil', 'onclick', 'href', 'http']) {
      assert.ok(!s.includes(w), w);
    }
    assert.equal(r.blocks[0].text, 't');
  });
});

describe('ClipRead: the whitelist', () => {
  it('script, style, iframe, object, img, svg dropped with content', () => {
    assert.deepEqual(texts('a<script>alert(1)</script><style>p{}' +
      '</style><iframe src="x">f</iframe><object>o</object><img src=x ' +
      'onerror="alert(1)"><svg><text>s</text></svg><noscript>n' +
      '</noscript><template>t</template><title>T</title>b'), ['ab']);
  });
  it('unknown tags are unwrapped', () => {
    assert.deepEqual(texts('<p><blink>a</blink><o:p>b</o:p><x-y>c' +
      '</x-y></p>'), ['abc']);
  });
  it('display:none and Word list labels are skipped', () => {
    assert.deepEqual(texts('<p>a<span style="display:none">h</span>' +
      '<span style="mso-list:Ignore">1.</span>b</p>'), ['ab']);
  });
  it('a Word fragment: o:p, mso- styles, conditional comments', () => {
    const h = '<html xmlns:o="urn:schemas-microsoft-com:office:office">' +
      '<head><style>p.MsoNormal{margin:0}</style></head><body lang=EN-GB>' +
      '<!--StartFragment--><p class=MsoNormal style=\'mso-margin-top-' +
      'alt:auto\'><b><span style=\'font-size:14.0pt;mso-bidi-font-' +
      'size:11.0pt;color:#C00000\'>Bold red<o:p></o:p></span></b></p>' +
      '<!--[if !supportLists]--><p class=MsoListParagraph>x<o:p>&nbsp;' +
      '</o:p></p><![if !vml]>v<![endif]><!--EndFragment--></body></html>';
    const r = read(h);
    assert.deepEqual(r.blocks.map((b) => b.text), ['Bold red', 'x ',
      'v']);
    assert.deepEqual(fmt(r, 0), {b: true, sz: 28, color: 'C00000',
      extra: []});
  });
  it('the Google Docs wrapper does not make everything bold', () => {
    const h = '<meta charset="utf-8"><b style="font-weight:normal;" ' +
      'id="docs-internal-guid-1234-abcd"><p dir="ltr"><span style="font-' +
      'size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:' +
      '400">plain</span><span style="font-weight:700">bold</span></p>' +
      '</b>';
    const r = read(h);
    assert.equal(r.blocks[0].text, 'plainbold');
    assert.equal(fmt(r, 0, 0).b, undefined);
    assert.equal(fmt(r, 0, 5).b, true);
    const r2 = read('<b id="docs-internal-guid-9">x</b>');
    assert.equal(fmt(r2, 0).b, undefined);
  });
  it('control characters, U+FFFC and lone surrogates cleaned', () => {
    const r = read('<p>a\u0001b￼c\ud800d\u0085e</p>');
    assert.equal(r.blocks[0].text, 'abc�de');
  });
  it('malformed HTML does not throw', () => {
    for (const h of ['<p><b>a</p>b</b>', '<<<>>>', '</p></div>x',
      '<p style="color:', '<a href=">x', '<!-- open', '<b<i>x',
      '&#xffffffff;&#0;&bogus;', '<table><td>x<tr>y']) {
      const r = read(h);
      if (r) for (const b of r.blocks) checkContent(b, true);
    }
  });
  it('a throwing parser, empty input, no text: null (fall back)', () => {
    assert.equal(readHtml('<p>x</p>', () => { throw new Error('x'); }),
      null);
    assert.equal(readHtml('', parseHtml), null);
    assert.equal(readHtml('<img src=x><script>a</script>', parseHtml),
      null);
    assert.equal(readHtml(null, parseHtml), null);
  });
});

describe('ClipRead: limits', () => {
  it('10,000 deep nesting: deeper elements unwrapped, quickly', () => {
    let n = mkText('deep');
    for (let k = 0; k < 10000; k++) n = mkEl('span', [n]);
    const t0 = Date.now();
    const r = readTree(mkEl('div', [mkText('top'), n]));
    assert.ok(Date.now() - t0 < 10000);
    assert.deepEqual(r.blocks.map((b) => b.text), ['topdeep']);
    const h = '<b>'.repeat(10000) + 'x<p>y</p><script>evil</script>' +
      '<span style="display:none">h</span>z' + '</b>'.repeat(10000);
    const d = read('ok' + h);
    assert.deepEqual(d.blocks.map((b) => b.text), ['okxyz']);
    assert.equal(fmt(d, 0, 3).b, true, 'the format around it');
    let ok = mkText('fine');
    for (let k = 0; k < LIMITS.depth - 2; k++) ok = mkEl('i', [ok]);
    assert.equal(readTree(ok).blocks[0].text, 'fine');
  });
  it('250,000 deep nesting: the node cap bounds the work', () => {
    let n = mkText('never');
    for (let k = 0; k < 250000; k++) n = mkEl('span', [n]);
    const t0 = Date.now();
    const r = readTree(mkEl('p', [mkText('a'), n]));
    assert.ok(Date.now() - t0 < 10000);
    assert.deepEqual(r.blocks.map((b) => b.text), ['a']);
  });
  it('1,000,000 nodes: capped at 200,000', () => {
    const kids = new Proxy({length: 1000000}, {get: (o, k) => (k ===
      'length' ? o.length : mkText('x'))});
    const t0 = Date.now();
    const r = readTree(mkEl('p', kids));
    assert.ok(Date.now() - t0 < 10000);
    assert.ok(r.blocks[0].text.length < LIMITS.nodes);
    assert.ok(r.blocks[0].text.length > 1000);
  });
  it('text over 5,000,000 units is cut', () => {
    const r = readTree(mkEl('p', [mkText('y'.repeat(4000000)),
      mkText('z'.repeat(4000000))]));
    assert.equal(r.blocks[0].text.length, LIMITS.text);
  });
});
