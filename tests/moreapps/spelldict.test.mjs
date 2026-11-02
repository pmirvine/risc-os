// SpellDict: the Hunspell reader, on tiny hand-made files and on
// the bundled en_GB.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {parseDict, checkDict}
  from '../../tools/moreapps/!Letters/SpellDict';

const DIR = new URL('../../tools/moreapps/!Letters/Dict/',
  import.meta.url);
const HAVE = existsSync(new URL('en_GB_dic', DIR));
const rd = (n) => readFileSync(new URL(n, DIR), 'utf8').replace(/^﻿/, '');

const mk = (dic, aff) =>
  parseDict({dic: dic.length + '\n' + dic.join('\n'), aff});

describe('SpellDict affixes', () => {
  const aff = [
    'SET UTF-8', 'TRY abc',
    'PFX A Y 1', 'PFX A 0 re .',
    'PFX B N 1', 'PFX B 0 un .',
    'SFX S Y 3', 'SFX S 0 s [^sy]', 'SFX S y ies [^aeiou]y',
    'SFX S 0 es s',
    'SFX D Y 2', 'SFX D e ed e', 'SFX D 0 ed [^e]',
    'SFX X Y 1', 'SFX X 0 ly/S .',
  ].join('\n');
  const d = mk(['walk/ASDB', 'try/S', 'bake/D', 'kiss/S', 'odd/X'],
    aff);
  it('suffix conditions and strip', () => {
    assert.ok(d.has('walks') && d.has('tries') && d.has('baked'));
    assert.ok(!d.has('walkd'));
    assert.ok(d.has('kisses') && !d.has('kisss'));
    assert.ok(!d.has('trys') && !d.has('bakeed'));
  });
  it('prefix and cross product', () => {
    assert.ok(d.has('rewalk') && d.has('rewalks'));
    assert.ok(d.has('unwalk'));
    assert.ok(!d.has('unwalks'));   // B is N: no cross
    assert.ok(!d.has('retry'));     // try lacks A
  });
  it('two-level suffixes', () => {
    assert.ok(d.has('oddly') && d.has('oddlies'));
    assert.ok(!d.has('oddlys'));    // S needs [^sy] or [^aeiou]y
  });
  it('exposes tryChars, rep, root, stemFlags', () => {
    assert.equal(d.tryChars, 'abc');
    assert.deepEqual(d.root('rewalks'), ['walk']);
    assert.equal(d.stemFlags('walk'), 'ASDB');
    assert.equal(d.stemFlags('nope'), null);
    assert.equal(d.ignore, '');
    assert.equal(d.has(''), false);
  });
});

describe('SpellDict case and flags', () => {
  const d = mk(['Paris', 'word', 'Gb/K', 'bad/F', 'badly', 'iPod',
    'tab\tmorph:x'],
  'KEEPCASE K\nFORBIDDENWORD F\nPFX P Y 1\nPFX P 0 b .\n');
  it('capitalised entries', () => {
    assert.ok(d.has('Paris') && d.has('PARIS'));
    assert.ok(!d.has('paris'));
  });
  it('lowercase entries take Word and WORD', () => {
    assert.ok(d.has('word') && d.has('Word') && d.has('WORD'));
    assert.ok(!d.has('wOrd'));
  });
  it('KEEPCASE is exact only', () => {
    assert.ok(d.has('Gb'));
    assert.ok(!d.has('GB') && !d.has('gb'));
  });
  it('FORBIDDENWORD is false even if derivable', () => {
    assert.ok(!d.has('bad'));
    assert.ok(d.has('badly'));
  });
  it('mixed case exact, tab description cut', () => {
    assert.ok(d.has('iPod') && !d.has('ipod'));
    assert.ok(d.has('tab'));
  });
});

describe('SpellDict ICONV, BREAK, compounds', () => {
  const aff = [
    "ICONV 2", "ICONV ’ '", 'ICONV ﬁ fi',
    'BREAK 1', 'BREAK -',
    'ONLYINCOMPOUND _', 'COMPOUNDMIN 1',
    'COMPOUNDRULE 1', 'COMPOUNDRULE #*0{',
  ].join('\n');
  const d = mk(["don't", 'fish', '0/#0', '1/#0', '2/#0', 'th/{',
    '1th/{_', 'only/_'], aff);
  it('curly quotes and ligatures', () => {
    assert.ok(d.has('don’t') && d.has('ﬁsh'));
  });
  it('BREAK pieces', () => {
    assert.ok(d.has('fish-fish') && !d.has('fish-fosh'));
    assert.ok(!d.has('-fish'));
  });
  it('COMPOUNDRULE and ONLYINCOMPOUND', () => {
    assert.ok(d.has('1') && d.has('21th') && d.has('120th'));
    assert.ok(!d.has('1th2'));
    assert.ok(!d.has('1x') && !d.has('only'));
    assert.ok(d.has('2024') && !d.has('2024x'));
  });
});

describe('SpellDict en_GB', { skip: !HAVE }, () => {
  const t0 = performance.now();
  const h0 = process.memoryUsage().heapUsed;
  const dic = rd('en_GB_dic'), aff = rd('en_GB_aff');
  const d = parseDict({dic, aff});
  const ms = performance.now() - t0;
  it('uses no unsupported directives', () => {
    for (const k of ['CIRCUMFIX', 'NEEDAFFIX', 'KEEPCASE', 'FORBIDDENWORD',
      'FLAG', 'IGNORE'])
      assert.ok(!new RegExp('^' + k + '\\b', 'm').test(aff), k);
  });
  it('knows and rejects', () => {
    for (const w of ['colour', 'colours', 'coloured', 'organise',
      'organising', 'London', 'don\'t', 'don’t', 'The', 'THE',
      '2024', '10th', 'well-known'])
      assert.ok(d.has(w), w);
    for (const w of ['color', 'colur', 'teh', '', 'londonn',
      'cityes', 'babyes', '1th', '11st', 'runninging'])
      assert.ok(!d.has(w), w);
    assert.ok(d.tryChars.startsWith('esia'));
    assert.ok(d.rep.length > 30 && d.rep[0].length === 2);
    assert.ok(d.root('colours').includes('colour'));
  });
  it('long untrusted words are quick', () => {
    for (const w of ['a'.repeat(50000),
      'a'.repeat(20000) + '-' + 'a'.repeat(20000),
      '1'.repeat(50000) + 'x']) {
      const t = performance.now();
      assert.equal(d.has(w), false);
      const e = performance.now() - t;
      assert.ok(e < 50, e + ' ms');
    }
  });
  it('parses within budget', () => {
    assert.ok(ms < 1500, ms + ' ms');
    const heap = process.memoryUsage().heapUsed - h0;
    assert.ok(heap < 80e6, heap + ' bytes');
  });
  it('10,000 lookups within budget', () => {
    const base = ['colour', 'colours', 'organising', 'teh', 'London',
      'colur', 'unhappily', 'rewritten', 'Zxqvt', 'running'];
    const ws = [];
    for (let i = 0; i < 10000; i++) {
      const b = base[i % base.length];
      ws.push(i % 3 === 0 ? b + (i % 7 ? '' : 's') : b);
    }
    const t = performance.now();
    for (const w of ws) d.has(w);
    const e = performance.now() - t;
    assert.ok(e < 500, e + ' ms');
  });
});

describe('SpellDict checkDict: damaged files', () => {
  const aff = 'SET UTF-8\nTRY abc\n';
  it('a sound pair passes', () => {
    assert.equal(checkDict(mk(['walk', 'talk'], aff)), null);
    assert.equal(checkDict(parseDict({dic: '10\n' +
      'a\nb\nc\nd\ne\nf\ng\nh\ni\n', aff})), null);   // (9 of 10)
  });
  it('cut short, garbage, empty, no count, no affix rules', () => {
    const cut = parseDict({dic: '100\na\nb\nc\n', aff});
    assert.match(checkDict(cut), /3 of its 100/);
    for (const dic of ['', 'garbage here\nmore', '\u0000\u0001\u0002',
      'walk\ntalk\n', '0\n', '-3\na\n']) {
      assert.ok(checkDict(parseDict({dic, aff})), JSON.stringify(dic));
    }
    assert.ok(checkDict(parseDict({dic: '2\na\nb\n', aff: ''})));
    assert.ok(checkDict(parseDict({dic: '2\na\nb\n',
      aff: '<html>not found</html>\n'})));
    assert.equal(checkDict(null), 'the word list does not begin with ' +
      'its count');
  });
  it('the bundled files pass; cut to a half they do not',
    {skip: !HAVE}, () => {
      const dic = rd('en_GB_dic'), aff2 = rd('en_GB_aff');
      assert.equal(checkDict(parseDict({dic, aff: aff2})), null);
      const half = dic.slice(0, dic.length >> 1);
      assert.ok(checkDict(parseDict({dic: half, aff: aff2})));
    });
});
