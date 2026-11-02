// SpellCheck: checkPara, the check of one paragraph.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {checkPara, paraSteps}
  from '../../tools/moreapps/!Letters/SpellCheck';
import {parseDict} from '../../tools/moreapps/!Letters/SpellDict';
import {loadDict, DICT_DIR}
  from '../../tools/moreapps/!Letters/SpellLoad';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';

const K = new Set(('the quick brown fox jumps over lazy dog hello ' +
  'world word is a test this and not valid it was here there new old ' +
  'text of in').split(' '));
const dict = {has: (w) => K.has(w.toLowerCase())};
const none = {markup: 'final', ignore: new Set(), personal: new Set()};
const D = '2024-01-02T03:04:00Z';
const att = (id) => `w:id="${id}" w:author="Ann" w:date="${D}"`;
const ins = (id, t) => `<w:ins ${att(id)}>${r(t)}</w:ins>`;
const del = (id, t) => `<w:del ${att(id)}><w:r><w:delText ` +
  `xml:space="preserve">${t}</w:delText></w:r></w:del>`;
const mk = async (body) => {
  const doc = await readDocx(await buildDocx(
    {'word/document.xml': documentXml(body)}));
  return [doc, doc.sections[0].blocks[0]];
};
const run = async (body, ctx = none) => {
  const [doc, para] = await mk(body);
  return checkPara(dict, doc, para, ctx);
};
const w = (a) => a.map((x) => x.word);

describe('checkPara', () => {
  it('flags teh, not a valid word', async () => {
    const got = await run(p(r('The teh fox is a valid zzzq')));
    assert.deepEqual(w(got), ['teh', 'zzzq']);
    assert.deepEqual(got[0], {from: 4, to: 7, word: 'teh'});
  });
  it('skips a noProof run and a fr run', async () => {
    const got = await run(p(r('teh ') + r('zork ', '<w:noProof/>') +
      r('bonjour ', '<w:lang w:val="fr-FR"/>') + r('blarg')));
    assert.deepEqual(w(got), ['teh', 'blarg']);
  });
  it('final: deleted text is not checked, inserted is', async () => {
    const got = await run(p(r('hello ') + del(1, 'zork ') +
      ins(2, 'blarg ') + r('world')));
    assert.deepEqual(w(got), ['blarg']);
  });
  it('all markup still skips deleted text', async () => {
    const got = await run(p(r('hello ') + del(1, 'zork ') +
      ins(2, 'blarg')), {...none, markup: 'all'});
    assert.deepEqual(w(got), ['blarg']);
  });
  it('original markup: the deleted is checked, the inserted not',
    async () => {
      const got = await run(p(r('hello ') + del(1, 'zork ') +
        ins(2, 'blarg')), {...none, markup: 'original'});
      assert.deepEqual(w(got), ['zork']);
    });
  it('hidden text inside a word joins it, ranges are offsets into text',
    async () => {
      const [doc, para] = await mk(p(r('hel') + del(1, 'xy') +
        r('lo teh')));
      assert.equal(para.text, 'helxylo teh');
      assert.deepEqual(checkPara(dict, doc, para, none),
        [{from: 8, to: 11, word: 'teh'}]);
      const bad = await mk(p(r('he') + del(1, 'XX') + r('llx')));
      assert.deepEqual(checkPara(dict, bad[0], bad[1], none),
        [{from: 0, to: 7, word: 'hellx'}]);
    });
  it('a word split over two runs is one range', async () => {
    const got = await run(p(r('wo') + r('rdd', '<w:b/>')));
    assert.deepEqual(got, [{from: 0, to: 5, word: 'wordd'}]);
  });
  it('a picture or field mark between letters splits the word',
    async () => {
      const got = await run(p(r('wor') +
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
        '<w:r><w:instrText> PAGE </w:instrText></w:r>' +
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
        r('zork') +
        '<w:r><w:fldChar w:fldCharType="end"/></w:r>' + r('ld teh')));
      assert.deepEqual(w(got), ['wor', 'ld', 'teh']);
      for (const g of got) assert.ok(!g.word.includes('￼'));
    });
  it('never flags inside a U+FFFC', async () => {
    const got = await run(p(r('a￼a teh')));
    assert.deepEqual(w(got), ['teh']);
  });
  it('ignore and personal words, any case', async () => {
    const ctx = {markup: 'final', ignore: new Set(['teh']),
      personal: new Set(['Zork'])};
    const got = await run(p(r('Teh zork ZORK blarg')), ctx);
    assert.deepEqual(w(got), ['blarg']);
  });
  it('capitalised sentence start and format characters', async () => {
    const got = await run(p(r('Hello wor­ld. THE quick')));
    assert.deepEqual(w(got), []);
    const g2 = await run(p(r('tes​t teh')));
    assert.deepEqual(w(g2), ['teh']);
  });
  it('digits and underscores only are not looked up', async () => {
    const got = await run(p(r('___ hello')));
    assert.deepEqual(w(got), []);
  });
  it('a dictionary that throws is the caller\'s: not caught', () => {
    assert.throws(() => checkPara({has() { throw new Error('x'); }},
      {}, {text: 'abc', runs: [{start: 0, end: 3}]}, none));
  });
  it('is linear: many runs and a long paragraph', async () => {
    const body = p(Array.from({length: 2000}, (_, i) =>
      r('hello ', i % 2 ? '<w:b/>' : '')).join(''));
    const [doc, para] = await mk(body);
    const best = () => {
      let m = Infinity;
      for (let i = 0; i < 6; i++) {
        const t = performance.now();
        checkPara(dict, doc, para, {...none, memo: new Map()});
        m = Math.min(m, performance.now() - t);
      }
      return m;
    };
    assert.ok(best() < 200, 'ms ' + best());
  });
});

describe('paraSteps: a piece at a time', () => {
  it('gives what checkPara gives, whatever the piece size, words ' +
    'over the joins included (fuzz)', async () => {
    const NOPROOF = '<w:noProof/>';
    const toks = [() => r('teh '), () => r('the '), () => r('wo') +
      r('rdx ', '<w:b/>'), () => r('he') + del(1, 'X Y ') + r('llx '),
    () => del(2, 'gone teh ') + r('a '), () => ins(3, 'blarg '),
    () => r('zork ', NOPROOF), () => r('O\u2019Neil dont\u2019 '),
    () => r('te\u00ADh\u200B '), () => r('http://x.com,teh '),
    () => r('a\uFFFCteh '), () => r('   '), () => r('teh,teh.'),
    () => '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText> PAGE </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' + r('zz') +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>' + r('qq ')];
    let sd = 4242;
    const rnd = () => (sd = (sd * 1103515245 + 12345) % 2147483648) /
      2147483648;
    for (let round = 0; round < 60; round++) {
      let xml = '';
      const n = 1 + Math.floor(rnd() * 30);
      for (let k = 0; k < n; k++) xml += toks[Math.floor(rnd() *
        toks.length)]();
      const [doc, para] = await mk(p(xml));
      for (const markup of ['final', 'original', 'all']) {
        const ctx = {...none, markup};
        const want = checkPara(dict, doc, para, ctx);
        for (const size of [1, 2, 3, 5, 8, 13, 40, 1000]) {
          const job = paraSteps(dict, doc, para, ctx);
          let k = 0;
          while (!job.step(size)) assert.ok(k++ < 1e5);
          assert.deepEqual(job.ranges, want,
            `${round} ${markup} ${size}: ${JSON.stringify(para.text)}`);
          assert.equal(job.step(size), true);
        }
      }
    }
  });
  it('an empty paragraph is done at once', async () => {
    const [doc, para] = await mk(p(''));
    const job = paraSteps(dict, doc, para, none);
    assert.equal(job.step(5), true);
    assert.deepEqual(job.ranges, []);
  });
});

const ROOT = new URL('../../tools/moreapps/!Letters/', import.meta.url);
describe('checkPara with the bundled dictionary', {
  skip: !existsSync(new URL('Dict/en_GB_dic', ROOT)) && 'no Dict/'},
() => {
  it('case rules, curly apostrophes, british spelling', async () => {
    const rd = async (q) =>
      new Uint8Array(readFileSync(new URL(q.split('.').join('/'),
        ROOT)));
    const real = parseDict(await loadDict(rd, DICT_DIR));
    const [doc, para] = await mk(p(r('Colour is nice. DON’T stop, ' +
      'don\'t go. Londn teh color')));
    const got = checkPara(real, doc, para, none);
    assert.ok(w(got).includes('Londn'));
    assert.ok(w(got).includes('teh'));
    assert.ok(!w(got).includes('Colour'));
    assert.ok(!w(got).includes('DON’T'));
    assert.ok(!w(got).includes("don't"));
  });
});
