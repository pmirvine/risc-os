// FieldParse (Batch D P8.1, D16): a field instruction as {name, args,
// switches, raw}; words, quoted strings, switches with their
// argument; capped; never throws, anything odd gives name ''.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parse, MAX_TOKENS, MAX_CHARS}
  from '../../tools/moreapps/!Letters/FieldParse';

const sw = (q) => q.switches.map(({sw: s, arg}) => [s, arg]);

describe('FieldParse', () => {
  it('PAGE \\* MERGEFORMAT', () => {
    const raw = ' PAGE  \\* MERGEFORMAT ';
    const q = parse(raw);
    assert.equal(q.name, 'PAGE');
    assert.deepEqual(q.args, []);
    assert.deepEqual(sw(q), [['\\*', 'MERGEFORMAT']]);
    assert.equal(q.raw, raw, 'raw is never rewritten');
  });

  it('the name is upper-cased; args and switches keep their case',
    () => {
      const q = parse('page \\* Arabic');
      assert.equal(q.name, 'PAGE');
      assert.deepEqual(sw(q), [['\\*', 'Arabic']]);
    });

  it('DATE \\@ "dd MMMM yyyy"', () => {
    const q = parse(' DATE \\@ "dd MMMM yyyy" \\* MERGEFORMAT ');
    assert.equal(q.name, 'DATE');
    assert.deepEqual(sw(q), [['\\@', 'dd MMMM yyyy'],
      ['\\*', 'MERGEFORMAT']]);
  });

  it('a quoted string with \\" and \\\\ inside', () => {
    const q = parse('HYPERLINK "say \\"hi\\" C:\\\\x" \\o "tip"');
    assert.equal(q.name, 'HYPERLINK');
    assert.deepEqual(q.args, ['say "hi" C:\\x']);
    assert.deepEqual(sw(q), [['\\o', 'tip']]);
  });

  it('\\# with "#,##0.00"', () => {
    const q = parse('= 1234.5 \\# "#,##0.00"');
    assert.equal(q.name, '=');
    assert.deepEqual(q.args, ['1234.5']);
    assert.deepEqual(sw(q), [['\\#', '#,##0.00']]);
    assert.equal(parse('=SUM(ABOVE)').name, '=');
    assert.deepEqual(parse('=SUM(ABOVE)').args, ['SUM(ABOVE)']);
  });

  it('switches with and without arguments; a switch run on', () => {
    const q = parse('PAGEREF _Toc123 \\h \\* MERGEFORMAT');
    assert.deepEqual(q.args, ['_Toc123']);
    assert.deepEqual(sw(q), [['\\h', null], ['\\*', 'MERGEFORMAT']]);
    const t = parse('TOC \\o "1-3" \\h \\z \\u');
    assert.deepEqual(sw(t), [['\\o', '1-3'], ['\\h', null],
      ['\\z', null], ['\\u', null]]);
    assert.deepEqual(sw(parse('PAGE \\*MERGEFORMAT')),
      [['\\*', 'MERGEFORMAT']]);
    assert.deepEqual(sw(parse('PAGE \\! \\* roman')),
      [['\\!', null], ['\\*', 'roman']]);
    assert.deepEqual(sw(parse('PAGE \\*')), [['\\*', null]]);
  });

  it('empty and blank', () => {
    for (const s of ['', '   ', '\t\r\n']) {
      assert.deepEqual(parse(s), {name: '', args: [], switches: [],
        raw: s});
    }
  });

  it('1024 tokens parse; 1025 -> UNKNOWN', () => {
    assert.equal(MAX_TOKENS, 1024);
    const ok = 'SEQ' + ' a'.repeat(1023);
    assert.equal(parse(ok).name, 'SEQ');
    assert.equal(parse(ok).args.length, 1023);
    const q = parse(ok + ' b');
    assert.equal(q.name, 'UNKNOWN');
    assert.deepEqual(q.args, []);
    assert.deepEqual(q.switches, []);
    assert.equal(q.raw, ok + ' b');
  });

  it('32 KB parse; 32 KB + 1 -> UNKNOWN', () => {
    assert.equal(MAX_CHARS, 32768);
    const ok = 'PAGE ' + ' '.repeat(MAX_CHARS - 5);
    assert.equal(ok.length, MAX_CHARS);
    assert.equal(parse(ok).name, 'PAGE');
    assert.equal(parse(ok + ' ').name, 'UNKNOWN');
  });

  it('odd input: name \'\', never a throw', () => {
    const odd = ['\\', 'PAGE \\', 'PAGE "open', '"quoted" name',
      '\\* MERGEFORMAT', 'PAGE \\@ "x'];
    for (const s of odd) {
      const q = parse(s);
      assert.equal(q.name, '', JSON.stringify(s));
      assert.equal(q.raw, s);
    }
    const proto = parse('__proto__ constructor \\__proto__ x');
    assert.equal(proto.name, '__PROTO__');
    assert.deepEqual(proto.args, ['constructor', 'x']);
    assert.deepEqual(sw(proto), [['\\_', '_proto__']]);
    assert.equal(Object.getPrototypeOf(proto.switches[0]),
      Object.prototype);
    const nul = parse('PA\0GE \0 "\0"');
    assert.equal(nul.name, 'PA\0GE');
    assert.deepEqual(nul.args, ['\0', '\0']);
    for (const v of [null, undefined, 3, {}, [], Symbol('x')]) {
      const q = parse(v);
      assert.equal(q.name, '');
      assert.equal(q.raw, '');
    }
  });

  it('random input never throws', () => {
    const chars = ['a', 'Z', ' ', '\\', '"', '*', '@', '#', '\0',
      '\ud800', '=', '\u00e9'];
    let seed = 7;
    const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2 ** 31)
      % n;
    for (let k = 0; k < 2000; k++) {
      let s = '';
      for (let j = rnd(40); j > 0; j--) s += chars[rnd(chars.length)];
      const q = parse(s);
      assert.equal(typeof q.name, 'string');
      assert.equal(q.raw, s);
    }
  });
});
