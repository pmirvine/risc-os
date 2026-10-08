// ClipStore: the in-memory registry of the last copies, looked up by
// the token the HTML carries.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {ClipStore, tokenIn, LIMITS}
  from '../../tools/moreapps/!Word/ClipStore';

const P = (text) => ({type: 'p', text, runs: [], inlines: {},
  pPr: {extra: []}});
let seq = 0;
const counter = () => {
  seq++;
  return Array.from({length: 8}, (_, k) => (seq * 37 + k * 11) & 255);
};

describe('ClipStore', () => {
  it('tokens are 16 lower-case hex digits; get returns the entry', () => {
    const s = new ClipStore();
    const blocks = [P('a')];
    const t = s.put({blocks, styleNames: new Map(), plain: 'a'}, 'doc1');
    assert.match(t, /^[0-9a-f]{16}$/);
    const e = s.get(t);
    assert.equal(e.blocks, blocks);
    assert.equal(e.docKey, 'doc1');
    assert.equal(e.plain, 'a');
    assert.ok(e.styleNames instanceof Map);
  });
  it('a plain array of blocks is accepted', () => {
    const s = new ClipStore();
    const t = s.put([P('x')], 7);
    assert.equal(s.get(t).docKey, 7);
    assert.equal(s.get(t).plain, 'x');
  });
  it('the default random source gives different tokens', () => {
    const s = new ClipStore();
    const seen = new Set();
    for (let k = 0; k < 50; k++) seen.add(s.put([P('a')], 1));
    assert.equal(seen.size, 50);
  });
  it('keeps the last 4 only', () => {
    const s = new ClipStore({rand: counter});
    const ts = [1, 2, 3, 4, 5].map((k) => s.put([P('t' + k)], k));
    assert.equal(s.get(ts[0]), null);
    for (const t of ts.slice(1)) assert.ok(s.get(t));
  });
  it('a colliding token is drawn again', () => {
    const s = new ClipStore({rand: (() => {
      let n = 0;
      return () => new Array(8).fill(n++ < 2 ? 1 : 2);
    })()});
    const a = s.put([P('a')], 1);
    const b = s.put([P('b')], 1);
    assert.notEqual(a, b);
    assert.equal(s.get(a).blocks[0].text, 'a');
  });
  it('refuses too much text or too many blocks', () => {
    const s = new ClipStore();
    assert.equal(s.put([P('x'.repeat(LIMITS.text + 1))], 1), null);
    const many = Array.from({length: LIMITS.blocks + 1}, () => P(''));
    assert.equal(s.put(many, 1), null);
    assert.equal(s.put([], 1), null);
    assert.equal(s.put(null, 1), null);
  });
  it('stale, malformed and foreign tokens give null', () => {
    const s = new ClipStore();
    s.put([P('a')], 1);
    for (const t of ['0123456789abcdef', 'ZZZZ', '', null, 5,
      '__proto__', 'constructor', '0123456789ABCDEF'])
      assert.equal(s.get(t), null);
    s.clear();
  });
  it('tokenIn finds the marker comment, exact form only', () => {
    assert.equal(tokenIn('<meta charset="utf-8"><!--word-clip:' +
      '0123456789abcdef--><p>x</p>'), '0123456789abcdef');
    assert.equal(tokenIn('<!--word-clip:0123456789abcde--><p>'), null);
    assert.equal(tokenIn('<!-- word-clip:0123456789abcdef -->'), null);
    assert.equal(tokenIn('<p>no token</p>'), null);
    assert.equal(tokenIn(null), null);
    assert.equal(tokenIn('<!--word-clip:0123456789ABCDEF-->'), null);
  });
  it('a token in foreign HTML that the store does not know: null', () => {
    const s = new ClipStore();
    const html = '<!--word-clip:00112233aabbccdd--><b>evil</b>';
    assert.equal(s.get(tokenIn(html)), null);
  });
});
