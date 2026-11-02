// SpellLang: language and Do-not-check on runs.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {langOf, noProofOf, checkable}
  from '../../tools/moreapps/!Letters/SpellLang';
import {buildDocx, documentXml, stylesXml, p, r}
  from './build-docx.mjs';

const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const paras = (doc) => blocks(doc).filter((b) => b.type === 'p');
const DEF = '<w:docDefaults><w:rPrDefault><w:rPr>' +
  '<w:lang w:val="en-GB"/></w:rPr></w:rPrDefault></w:docDefaults>';
const sty = (defs, body) => stylesXml(defs +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
  '<w:name w:val="Normal"/></w:style>' + body);
const mk = async (body, styles = sty(DEF, '')) => readDocx(
  await buildDocx({'word/document.xml': documentXml(body),
    'word/styles.xml': styles}));
const first = (doc) => {
  const q = paras(doc)[0];
  return [doc, q, q.runs[0]];
};

describe('SpellLang', () => {
  it('a fr-FR run is not checkable', async () => {
    const a = first(await mk(p(r('x', '<w:lang w:val="fr-FR"/>'))));
    assert.equal(langOf(...a), 'fr-FR');
    assert.equal(checkable(...a), false);
  });
  it('en-US, en-AU not; en, en-gb checkable', async () => {
    for (const [l, ok] of [['en-US', false], ['en-AU', false],
      ['en', true], ['en-gb', true], ['EN-GB', true]]) {
      const a = first(await mk(p(r('x', `<w:lang w:val="${l}"/>`))));
      assert.equal(checkable(...a), ok, l);
    }
  });
  it('eastAsia alone is ignored', async () => {
    const a = first(await mk(p(r('x', '<w:lang w:eastAsia="ja-JP"/>')),
      sty('', '')));
    assert.equal(langOf(...a), 'en-GB');
    assert.equal(checkable(...a), true);
  });
  it('eastAsia-only lang still inherits w:val from below', async () => {
    const run = '<w:lang w:eastAsia="ja-JP"/>';
    const st = sty(DEF, '<w:style w:type="paragraph" w:styleId="P">' +
      '<w:basedOn w:val="Normal"/>' +
      '<w:rPr><w:lang w:val="fr-FR"/></w:rPr></w:style>');
    const a = first(await mk(p(r('x', run), '<w:pStyle w:val="P"/>'),
      st));
    assert.equal(langOf(...a), 'fr-FR');
    assert.equal(checkable(...a), false);
    const d = '<w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault></w:docDefaults>';
    const b = first(await mk(p(r('x', run)), sty(d, '')));
    assert.equal(langOf(...b), 'fr-FR');
    assert.equal(checkable(...b), false);
    const c = first(await mk(p(r('x', run)), sty('', '')));
    assert.equal(langOf(...c), 'en-GB');
    const e = first(await mk(p(r('x', '<w:lang w:val=""/>')),
      sty(d, '')));
    assert.equal(langOf(...e), 'fr-FR');
  });
  it('run beats character style beats paragraph style', async () => {
    const st = sty(DEF, '<w:style w:type="paragraph" w:styleId="P">' +
      '<w:basedOn w:val="Normal"/>' +
      '<w:rPr><w:lang w:val="de-DE"/></w:rPr></w:style>' +
      '<w:style w:type="character" w:styleId="Fr">' +
      '<w:rPr><w:lang w:val="fr-FR"/></w:rPr></w:style>');
    const doc = await mk(
      p(r('x', '<w:rStyle w:val="Fr"/>'), '<w:pStyle w:val="P"/>') +
      p(r('y', '<w:rStyle w:val="Fr"/><w:lang w:val="en-GB"/>'),
        '<w:pStyle w:val="P"/>'), st);
    const [q1, q2] = paras(doc);
    assert.equal(langOf(doc, q1, q1.runs[0]), 'fr-FR');
    assert.equal(langOf(doc, q2, q2.runs[0]), 'en-GB');
  });
  it('noProof from docDefaults and from a character style',
    async () => {
      const d = '<w:docDefaults><w:rPrDefault><w:rPr><w:noProof/>' +
        '</w:rPr></w:rPrDefault></w:docDefaults>';
      const a = first(await mk(p(r('x')), sty(d, '')));
      assert.equal(noProofOf(...a), true);
      assert.equal(checkable(...a), false);
      const st = sty(DEF, '<w:style w:type="character" ' +
        'w:styleId="C"><w:rPr><w:noProof/></w:rPr></w:style>');
      const b = first(await mk(p(r('x', '<w:rStyle w:val="C"/>')),
        st));
      assert.equal(noProofOf(...b), true);
      assert.equal(checkable(...b), false);
    });
  it('a character style supplies the language', async () => {
    const st = sty(DEF, '<w:style w:type="character" w:styleId="Fr">' +
      '<w:rPr><w:lang w:val="fr-FR"/></w:rPr></w:style>' +
      '<w:style w:type="character" w:styleId="Fr2">' +
      '<w:basedOn w:val="Fr"/></w:style>');
    const a = first(await mk(p(r('x', '<w:rStyle w:val="Fr2"/>')), st));
    assert.equal(langOf(...a), 'fr-FR');
    assert.equal(checkable(...a), false);
  });
  it('the run beats the style, the style beats docDefaults',
    async () => {
      const st = sty(DEF, '<w:style w:type="paragraph" ' +
        'w:styleId="P"><w:basedOn w:val="Normal"/>' +
        '<w:rPr><w:lang w:val="de-DE"/></w:rPr></w:style>');
      const doc = await mk(p(r('x'), '<w:pStyle w:val="P"/>') +
        p(r('y', '<w:lang w:val="en-GB"/>'), '<w:pStyle w:val="P"/>'),
      st);
      const [q1, q2] = paras(doc);
      assert.equal(langOf(doc, q1, q1.runs[0]), 'de-DE');
      assert.equal(langOf(doc, q2, q2.runs[0]), 'en-GB');
    });
  it('docDefaults en-GB is checkable; none set gives en-GB',
    async () => {
      assert.equal(checkable(...first(await mk(p(r('x'))))), true);
      const a = first(await mk(p(r('x')), sty('', '')));
      assert.equal(langOf(...a), 'en-GB');
      assert.equal(checkable(...a), true);
    });
  it('docDefaults fr-FR makes plain runs not checkable', async () => {
    const d = '<w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault></w:docDefaults>';
    assert.equal(checkable(...first(await mk(p(r('x')), sty(d, '')))),
      false);
  });
  it('noProof on a run', async () => {
    const a = first(await mk(p(r('x', '<w:noProof/>'))));
    assert.equal(noProofOf(...a), true);
    assert.equal(checkable(...a), false);
  });
  it('noProof w:val 0/false/off is checkable', async () => {
    for (const v of ['0', 'false', 'off']) {
      const a = first(await mk(p(r('x', `<w:noProof w:val="${v}"/>`))));
      assert.equal(noProofOf(...a), false, v);
      assert.equal(checkable(...a), true, v);
    }
    const t = first(await mk(p(r('x', '<w:noProof w:val="1"/>'))));
    assert.equal(noProofOf(...t), true);
  });
  it('paragraph-style noProof; a run can switch it off', async () => {
    const st = sty(DEF, '<w:style w:type="paragraph" ' +
      'w:styleId="Code"><w:basedOn w:val="Normal"/>' +
      '<w:rPr><w:noProof/></w:rPr></w:style>');
    const doc = await mk(p(r('x'), '<w:pStyle w:val="Code"/>') +
      p(r('y', '<w:noProof w:val="0"/>'), '<w:pStyle w:val="Code"/>'),
    st);
    const [q1, q2] = paras(doc);
    assert.equal(checkable(doc, q1, q1.runs[0]), false);
    assert.equal(checkable(doc, q2, q2.runs[0]), true);
  });
  it('a basedOn loop does not hang', async () => {
    const st = sty(DEF, '<w:style w:type="character" w:styleId="A">' +
      '<w:basedOn w:val="B"/></w:style>' +
      '<w:style w:type="character" w:styleId="B">' +
      '<w:basedOn w:val="A"/><w:rPr><w:lang w:val="fr-FR"/></w:rPr>' +
      '</w:style>');
    const a = first(await mk(p(r('x', '<w:rStyle w:val="A"/>')), st));
    assert.equal(langOf(...a), 'fr-FR');
  });
  it('missing doc/styles do not throw', () => {
    const run = {start: 0, end: 1, rPr: {extra: []}};
    assert.equal(checkable(null, {}, run), true);
    assert.equal(checkable({}, {}, run), true);
  });
  it('is fast', async () => {
    const a = first(await mk(p(r('x', '<w:lang w:val="en-GB"/>'))));
    for (let i = 0; i < 1000; i++) checkable(...a);
    let best = Infinity;
    for (let k = 0; k < 5; k++) {
      const t = performance.now();
      for (let i = 0; i < 10000; i++) checkable(...a);
      best = Math.min(best, performance.now() - t);
    }
    assert.ok(best < 500, 'best ' + best);
  });
});

describe('SpellLang: round trip through the .docx writer', () => {
  const DEF2 = '<w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:lang w:val="en-GB"/><w:noProof/></w:rPr></w:rPrDefault>' +
    '</w:docDefaults>';
  const st = sty(DEF2, '<w:style w:type="character" w:styleId="Fr">' +
    '<w:rPr><w:lang w:val="fr-FR"/><w:noProof/></w:rPr></w:style>');
  const body = p(r('Hello world', '<w:lang w:val="fr-FR"/>')) +
    p(r('code', '<w:noProof/>') + r('more', '<w:rStyle w:val="Fr"/>'));
  const state = (doc) => {
    const out = [langOf, noProofOf, checkable].map((f) =>
      paras(doc).map((q) => q.runs.map((x) => f(doc, q, x))));
    out.push(JSON.stringify(doc.styles.docDefaults.rPr.extra));
    out.push(JSON.stringify(doc.styles.styles.get('Fr').rPr.extra));
    return out;
  };
  it('read -> write -> read keeps lang and noProof', async () => {
    const doc = await mk(body, st);
    const back = await readDocx(await writeDocx(doc,
      {date: new Date(2024, 4, 6)}));
    assert.deepEqual(state(back), state(doc));
    assert.equal(checkable(...first(back)), false);
    const q = paras(back)[1];
    assert.equal(noProofOf(back, q, q.runs[0]), true);
    assert.equal(langOf(back, q, q.runs[1]), 'fr-FR');
    const dd = JSON.stringify(back.styles.docDefaults.rPr.extra);
    assert.match(dd, /en-GB/);
    assert.match(dd, /w:noProof/);
    assert.match(JSON.stringify(back.styles.styles.get('Fr').rPr.extra),
      /w:noProof/);
  });
  it('typing inside the run keeps them', async () => {
    const doc = await mk(body, st);
    const d = new Document(doc);
    d.apply({op: 'replaceText', block: [0, 0], at: 5, del: 0,
      ins: ' big'});
    d.apply({op: 'replaceText', block: [0, 1], at: 2, del: 0,
      ins: 'X'});
    const back = await readDocx(await writeDocx(d.doc,
      {date: new Date(2024, 4, 6)}));
    for (const x of [d.doc, back]) {
      const [q0, q1] = paras(x);
      assert.equal(q0.text, 'Hello big world');
      assert.equal(q0.runs.length, 1);
      assert.equal(checkable(x, q0, q0.runs[0]), false);
      assert.equal(q1.text, 'coXdemore');
      assert.equal(noProofOf(x, q1, q1.runs[0]), true);
      assert.equal(langOf(x, q1, q1.runs[q1.runs.length - 1]), 'fr-FR');
    }
  });
});
