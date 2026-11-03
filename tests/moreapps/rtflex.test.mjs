import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {lex, isRtf} from '../../tools/moreapps/!WimpLib/RtfLex';

const enc = (s) => Uint8Array.from(Buffer.from(s, 'latin1'));
const L = (s, o) => lex(enc(s), o);
const txt = (t) => Buffer.from(t.bytes).toString('latin1');
/** A compact form of the tokens, for comparing. */
const show = (s, o) => L(s, o).tokens.map((t) => {
  if (t.t === 'word') {
    return (t.star ? '*' : '') + '\\' + t.name +
      (t.param === undefined ? '' : t.param);
  }
  if (t.t === 'text') return '"' + txt(t) + '"';
  if (t.t === 'hex') return "'" + t.byte;
  if (t.t === 'bin') return 'bin[' + [...t.bytes].join(',') + ']';
  return t.t;
});

describe('RtfLex tokens', () => {
  it('words, parameters and delimiters', () => {
    assert.deepEqual(show('{\\rtf1\\ansi\\par text}'),
      ['{', '\\rtf1', '\\ansi', '\\par', '"text"', '}']);
    assert.deepEqual(show('\\b0x'), ['\\b0', '"x"']);
    assert.deepEqual(show('\\b0  x'), ['\\b0', '" x"']);
    assert.deepEqual(show('\\fs-24 x'), ['\\fs-24', '"x"']);
    assert.deepEqual(show('\\foo-bar'), ['\\foo', '"-bar"']);
  });
  it('escapes join the text; \\~ \\- \\_ are words', () => {
    assert.deepEqual(show('a\\\\b\\{c\\}d'), ['"a\\b{c}d"']);
    assert.deepEqual(show('a\\~b\\-c\\_d'),
      ['"a"', '\\~', '"b"', '\\-', '"c"', '\\_', '"d"']);
  });
  it("\\'hh is a hex token", () => {
    assert.deepEqual(show("a\\'e9b\\'E9\\'4"), ['"a"', "'233", '"b"',
      "'233", '"4"']);
  });
  it('\\* marks the next word', () => {
    assert.deepEqual(show('{\\*\\generator x;}'),
      ['{', '*\\generator', '"x;"', '}']);
  });
  it('CR and LF are ignored; a backslash before one is \\par', () => {
    assert.deepEqual(show('a\r\nb\\\nc'), ['"ab"', '\\par', '"c"']);
  });
  it('\\uN is a word with a signed 16-bit parameter', () => {
    assert.deepEqual(show('\\u233?'), ['\\u233', '"?"']);
    assert.deepEqual(show('\\u-3?'), ['\\u-3', '"?"']);
    assert.deepEqual(show('\\u65533?'), ['\\u-3', '"?"']);
    assert.deepEqual(show('\\u40000 x'), ['\\u-25536', '"x"']);
    assert.deepEqual(show('\\u32767?\\u32768?'),
      ['\\u32767', '"?"', '\\u-32768', '"?"']);
  });
  it('\\uc0 and \\uc2 are delivered as plain words', () => {
    assert.deepEqual(show('\\uc0\\u233 \\uc2'),
      ['\\uc0', '\\u233', '\\uc2']);
  });
  it('\\binN data may hold braces and backslashes', () => {
    assert.deepEqual(show('\\bin5 }{\\ab'), ['bin[125,123,92,97,98]']);
    assert.deepEqual(show('\\bin2 }}x'), ['bin[125,125]', '"x"']);
  });
  it('a \\bin past the end is cut, with a note', () => {
    const r = L('\\bin99 ab');
    assert.deepEqual([...r.tokens[0].bytes], [0x61, 0x62]);
    assert.ok(r.notes.length);
  });
  it('a lone backslash and unknown symbols do not throw', () => {
    assert.deepEqual(show('a\\'), ['"a"']);
    assert.deepEqual(show('\\|x'), ['\\|', '"x"']);
  });
});

describe('RtfLex hostile input', () => {
  it('a 300,000-letter word or number does not throw', () => {
    const w = L('\\' + 'a'.repeat(300000) + ' x');
    assert.equal(w.tokens[0].name.length, 32);
    assert.ok(w.notes.length);
    const d = L('\\fs' + '9'.repeat(300000) + ' x');
    assert.equal(d.tokens[0].name, 'fs');
    assert.ok(Number.isFinite(d.tokens[0].param));
  });
  it('\\* before bin or hex does not reach a later word', () => {
    assert.deepEqual(show('\\*\\bin1 x\\par'), ['bin[120]', '\\par']);
    assert.deepEqual(show("\\*\\'e9\\par"), ["'233", '\\par']);
  });
  it('maxTokens counts text tokens', () => {
    const r = L('a\\b b\\c c', {maxTokens: 2});
    assert.equal(r.tokens.length, 2);
  });
});

describe('RtfLex limits and balance', () => {
  it('extra closes are ignored and missing ones appended', () => {
    const a = L('a}b');
    assert.deepEqual(show('a}b'), ['"ab"']);
    assert.ok(a.notes.length);
    const b = L('{{a');
    assert.deepEqual(b.tokens.map((t) => t.t),
      ['{', '{', 'text', '}', '}']);
    assert.ok(b.notes.length);
    assert.equal(L('{a}').notes.length, 0);
  });
  it('257 nested groups stop the scan; 256 do not', () => {
    const ok = L('{'.repeat(256) + 'x' + '}'.repeat(256));
    assert.equal(ok.notes.length, 0);
    const bad = L('{'.repeat(257) + 'x' + '}'.repeat(257));
    assert.ok(bad.notes.length);
    const depth = bad.tokens.reduce((d, t) =>
      d + (t.t === '{' ? 1 : t.t === '}' ? -1 : 0), 0);
    assert.equal(depth, 0);
    assert.ok(bad.tokens.every((t) => t.t !== 'text'));
  });
  it('maxTokens stops the scan with a note', () => {
    const r = L('\\a\\b\\c\\d\\e', {maxTokens: 3});
    assert.equal(r.tokens.length, 3);
    assert.ok(r.notes.length);
  });
});

describe('isRtf', () => {
  it('needs {\\rtf after an optional BOM and white space', () => {
    assert.ok(isRtf(enc('{\\rtf1')));
    assert.ok(isRtf(enc('\xef\xbb\xbf \r\n{\\rtf1')));
    assert.ok(!isRtf(enc('{\\rt')));
    assert.ok(!isRtf(enc('hello')));
    assert.ok(!isRtf(enc('')));
  });
});

describe('RtfLex fuzz', () => {
  const DIR = fileURLToPath(new URL('./rtf-fixtures/',
    import.meta.url));
  const fixtures = fs.readdirSync(DIR).filter((n) => n.endsWith('.rtf'))
    .map((n) => new Uint8Array(fs.readFileSync(DIR + n)));
  it('never throws, on random bytes or damaged fixtures', () => {
    let s = 12345;
    const rnd = (n) => {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      return (s >>> 8) % n;
    };
    const alphabet = enc('\\{}\'*-~ 0123456789abuf\r\n');
    for (let k = 0; k < 2000; k++) {
      let b;
      if (k % 2) {
        b = new Uint8Array(rnd(200));
        for (let i = 0; i < b.length; i++) {
          b[i] = rnd(3) ? alphabet[rnd(alphabet.length)] : rnd(256);
        }
      } else {
        const f = fixtures[rnd(fixtures.length)];
        b = f.slice(0, rnd(f.length + 1));
        for (let m = rnd(6); m > 0 && b.length; m--) {
          b[rnd(b.length)] = rnd(256);
        }
      }
      const r = lex(b);
      assert.ok(Array.isArray(r.tokens) && Array.isArray(r.notes));
    }
  });
  it('every fixture lexes balanced and without notes', () => {
    for (const f of fixtures) {
      const r = lex(f);
      assert.equal(r.notes.length, 0, r.notes.join('; '));
    }
  });
});
