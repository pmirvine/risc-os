// ClipHtml: a slice as an escaped HTML fragment for other programs;
// and the round trip write -> parse -> ClipRead.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {toHtml, MAX_HTML} from '../../tools/moreapps/!Word/ClipHtml';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {readTree} from '../../tools/moreapps/!Word/ClipRead';
import {resolver, charOf, alignOf}
  from '../../tools/moreapps/!Word/FormatEff';
import {headingLevel} from '../../tools/moreapps/!Word/Fmt';
import {mk, SEL, box, raw, O, plain} from './edit-docs.mjs';
import {lv, N} from './list-docs.mjs';
import {parseHtml} from './html-fake.mjs';
import {rng} from './word-docs.mjs';

const TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol',
  'li', 'b', 'i', 'u', 's', 'sup', 'sub', 'span', 'br', 'a']);
const all = (d) => {
  const bs = d.doc.sections[0].blocks;
  const last = bs.length - 1;
  return SEL(d, 0, 0, last, bs[last].type === 'p'
    ? bs[last].text.length : 1);
};
const html = (d, o) => toHtml(d.doc, slice(d.doc, all(d)), o);
const R = (rPr) => ({...rPr, extra: []});
const one = (text, rPr, o = {}) => [text, {...o,
  runs: [{start: 0, end: text.length, rPr: R(rPr)}]}];

/** Every tag in s is whitelisted; returns the tag names. */
function tagsOf(s) {
  const out = [];
  for (const m of s.matchAll(/<\/?([a-zA-Z0-9]+)/g)) {
    assert.ok(TAGS.has(m[1]), 'tag ' + m[1]);
    out.push(m[1]);
  }
  return out;
}

describe('ClipHtml.toHtml', () => {
  it('escapes text: script, entities, quotes, emoji, U+2028', () => {
    const t = '<script>alert(1)</script> &amp; "q" \'s\' \u{1F600}' +
      ' x';
    const d = mk([t]);
    const h = html(d);
    tagsOf(h);
    assert.ok(!h.includes('<script'));
    assert.ok(h.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(h.includes('&amp;amp;'));
    assert.ok(h.includes('&quot;q&quot; &#39;s&#39;'));
    assert.ok(h.includes('\u{1F600} x'));
    const back = readTree(parseHtml(h));
    assert.equal(back.blocks[0].text, t);
  });
  it('the token comment comes first; a bad token is left out', () => {
    const d = mk(['a']);
    const t = '0123456789abcdef';
    assert.ok(html(d, {token: t}).startsWith('<!--word-clip:' + t +
      '-->'));
    assert.ok(!html(d, {token: '--><script>'}).includes('word-clip'));
    assert.ok(!html(d).includes('word-clip'));
  });
  it('headings by style or outline level', () => {
    const d = mk([['Title', {pStyle: 'Heading1'}], ['Sub',
      {pPr: {outlineLvl: 1, extra: []}}], 'body']);
    const h = html(d);
    assert.deepEqual(tagsOf(h).filter((x) => /^(h\d|p)$/.test(x)),
      ['h1', 'h1', 'h2', 'h2', 'p', 'p']);
    assert.match(h, /<h1[^>]*><b><span style="font-family:&#39;/);
  });
  it('character formatting as tags and a span', () => {
    const d = mk([one('x', {b: true, i: true, u: 'double', strike: true,
      vertAlign: 'superscript', color: 'ff0000', sz: 28,
      rFonts: {ascii: 'Arial', hAnsi: 'Arial'}, highlight: 'yellow'})]);
    const h = html(d);
    assert.match(h, /<b><i><u><s><sup><span style="([^"]*)">x<\/span>/);
    const css = /<span style="([^"]*)">/.exec(h)[1];
    assert.ok(css.includes('color:#FF0000'));
    assert.ok(css.includes('font-family:&#39;Arial&#39;'));
    assert.ok(css.includes('font-size:14pt'));
    assert.ok(css.includes('background-color:#ffff00'));
    const sub = html(mk([one('y', {vertAlign: 'subscript'})]));
    assert.match(sub, /<sub>y<\/sub>/);
  });
  it('plain text: no span, no tags', () => {
    const h = html(mk(['plain']));
    assert.equal(h, '<p style="white-space:pre-wrap">plain</p>');
  });
  it('alignment, line breaks, tabs, empty paragraphs, tables', () => {
    const d = mk([['a\nb\tc\n', {pPr: {jc: 'center', extra: []}}], '',
      box(), 'z']);
    const h = html(d);
    assert.ok(h.startsWith('<p style="white-space:pre-wrap;' +
      'text-align:center">a<br>b\tc<br><br></p>'));
    assert.ok(h.includes('<p style="white-space:pre-wrap"><br></p>' +
      '<p style="white-space:pre-wrap"><br></p>'));
  });
  it('list items as ul / ol and li', () => {
    const d = mk([['one', {pPr: {numPr: {numId: 1, ilvl: 0}, extra: []}}],
      ['two', {pPr: {numPr: {numId: 1, ilvl: 0}, extra: []}}],
      ['dot', {pPr: {numPr: {numId: 2, ilvl: 0}, extra: []}}], 'after']);
    d.doc.numbering = {raw: null, nums: new Map([[1, N([lv(0)])],
      [2, N([lv(0, {numFmt: 'bullet', lvlText: '•'})], 2)]])};
    const h = html(d);
    assert.deepEqual(tagsOf(h), ['ol', 'li', 'li', 'li', 'li', 'ol', 'ul',
      'li', 'li', 'ul', 'p', 'p']);
    const back = readTree(parseHtml(h));
    assert.deepEqual(back.blocks.map((b) => b.text),
      ['one', 'two', 'dot', 'after']);
  });
  it('links: text only unless urlOf gives a safe URL', () => {
    const link = raw('hyperlink', 'p', 'site & co');
    const d = mk([['go ' + O, {inlines: {3: link}}]]);
    assert.ok(html(d).includes('go site &amp; co'));
    const u = html(d, {urlOf: () => 'https://x.test/?a=1&b="2"'});
    assert.ok(u.includes('<a href="https://x.test/?a=1&amp;b=&quot;2' +
      '&quot;">site &amp; co</a>'));
    for (const bad of ['javascript:alert(1)', 'data:text/html,x',
      ' https://x', 'https://x y', 42, null]) {
      const h = html(d, {urlOf: () => bad});
      assert.ok(!h.includes('<a'), String(bad));
    }
  });
  it('over the size cap: null (plain text only)', () => {
    const d = mk(['x'.repeat(1000), 'y'.repeat(1000)]);
    assert.equal(html(d, {max: 500}), null);
    assert.ok(html(d, {max: 5000}));
    assert.equal(MAX_HTML, 2000000);
    const big = mk(['z'.repeat(MAX_HTML + 1)]);
    assert.equal(html(big), null);
  });
});

/** [char, format] for every displayed character of block b. */
function chars(b, res) {
  const out = [];
  for (const r of b.runs) {
    const c = charOf(res.run(b, r.rPr, r.rStyle), b, res);
    const f = JSON.stringify([c.bold, c.italic, c.underline, c.strike,
      c.size, c.family, c.color, c.vert]);
    for (let i = r.start; i < r.end; i++) {
      let t = b.text[i];
      if (t === O) {
        const x = b.inlines[i];
        t = x.kind === 'tab' ? '\t' : x.kind === 'br' ? '\n'
          : x.text || '';
      }
      for (const ch of t) out.push(ch + f);
    }
  }
  return out;
}

const PIECES = ['ab', 'c d', '  ', '\t', '\n', '<&>', '"\'', '\u{1F600}',
  'é', 'word', O];
const FMTS = [{}, {b: true}, {i: true}, {u: 'single'}, {strike: true},
  {vertAlign: 'superscript'}, {vertAlign: 'subscript'},
  {color: '1F4E79'}, {sz: 21}, {sz: 36}, {b: false},
  {rFonts: {ascii: 'Times New Roman', hAnsi: 'Times New Roman'}},
  {b: true, i: true, color: 'C00000'}];

function randPara(r) {
  let text = '';
  const runs = [], inlines = {};
  const n = Math.floor(r() * 5);
  for (let k = 0; k < n; k++) {
    const t = PIECES[Math.floor(r() * PIECES.length)];
    if (t === O) inlines[text.length] = raw('hyperlink', 'p', 'lnk');
    runs.push({start: text.length, end: text.length + t.length,
      rPr: R(FMTS[Math.floor(r() * FMTS.length)])});
    text += t;
  }
  const o = {runs, inlines, pPr: {extra: []}};
  const k = r();
  if (k < 0.15) o.pStyle = 'Heading' + (1 + Math.floor(r() * 3));
  else if (k < 0.3) o.pPr = {jc: ['center', 'right', 'both'][
    Math.floor(r() * 3)], extra: []};
  return [text, o];
}

describe('ClipHtml: a large copy', () => {
  it('50,000 paragraphs: over 2 MB gives null, plain text kept', () => {
    const d = mk(Array.from({length: 50000}, (_, k) => 'Paragraph ' +
      'number ' + k));
    const t0 = Date.now();
    const s = slice(d.doc, SEL(d, 0, 0, 49999, 5));
    const h = toHtml(d.doc, s);
    assert.ok(Date.now() - t0 < 10000);
    assert.equal(h, null);
    assert.equal(s.plain.split('\n').length, 50000);
    assert.ok(toHtml(d.doc, s, {max: 1e8}).length > MAX_HTML);
  });
});

describe('ClipHtml round trip (property)', () => {
  it('write -> parse -> read: same text and formatting', () => {
    const r = rng(4242);
    for (let n = 0; n < 150; n++) {
      const list = Array.from({length: 1 + Math.floor(r() * 5)},
        () => (r() < 0.1 ? box() : randPara(r)));
      const d = mk(list);
      const bs = d.doc.sections[0].blocks;
      const k1 = Math.floor(r() * bs.length);
      const k2 = k1 + Math.floor(r() * (bs.length - k1));
      const end = (k) => (bs[k].type === 'p' ? bs[k].text.length : 1);
      const sel = SEL(d, k1, 0, k2, end(k2));
      const s = slice(d.doc, sel);
      if (!s) continue;
      const h = toHtml(d.doc, s);
      tagsOf(h);
      const back = readTree(parseHtml(h));
      const src = resolver(d.doc);
      const dst = resolver({styles: null});
      assert.equal(back.blocks.length, s.blocks.length, h);
      s.blocks.forEach((b, k) => {
        const q = back.blocks[k];
        if (b.type !== 'p') {
          assert.equal(q.text, '');
          return;
        }
        assert.deepEqual(chars(q, dst), chars(b, src), h);
        const pp = src.para(b);
        assert.equal(alignOf(q.pPr.jc), alignOf(pp.jc));
        const hl = headingLevel(src.styles, b, pp);
        assert.equal(q.pStyle, hl ? 'Heading' + hl : undefined);
      });
    }
  });
  it('plain run of the mill paragraph has plain rPr after reading', () => {
    const back = readTree(parseHtml(html(mk(['abc']))));
    assert.deepEqual(back.blocks[0].runs, [{start: 0, end: 3,
      rPr: plain}]);
  });
});
