// DocxWrite with extension elements and edited properties: where
// w14/w15 elements go, and edits that replace raw property elements.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {Document} from '../../tools/moreapps/!Word/Document';
import {deepEqual} from '../../tools/moreapps/!Word/Model';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {xmlEntries} from './docx-compare.mjs';

const EXT = ' xmlns:w14="http://schemas.microsoft.com/office/word/2010/' +
  'wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/' +
  'wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-' +
  'compatibility/2006" mc:Ignorable="w14 w15"';
const DATE = new Date(2024, 0, 2);
const isEl = (c) => typeof c === 'object' && c.name !== undefined;
const kids = (n, name) => n.children.filter((c) => isEl(c) &&
  (name === undefined || c.name === name));
const kid = (n, name) => kids(n, name)[0];
const names = (n) => kids(n).map((c) => c.name);

const read = async (body) => readDocx(await buildDocx(
  {'word/document.xml': documentXml(body, {rootAttrs: EXT})}));

/** The w:body of the document `doc` is written as. */
async function body(doc) {
  const x = await xmlEntries(await writeDocx(doc, {date: DATE}));
  return kid(x.get('word/document.xml').root, 'w:body');
}

const CHG = (n) => `<w:${n}Change w:id="1" w:author="a" ` +
  `w:date="2024-01-01T00:00:00Z"><w:${n}/></w:${n}Change>`;

describe('DocxWrite: extension elements', () => {
  it('rPr: an extension stays before rPrChange', async () => {
    const b = await body(await read(p(r('x', '<w:b/>' +
      '<w14:ligatures w14:val="standard"/>' + CHG('rPr')))));
    const rPr = kid(kid(kid(b, 'w:p'), 'w:r'), 'w:rPr');
    assert.deepEqual(names(rPr), ['w:b', 'w14:ligatures', 'w:rPrChange']);
  });

  it('rPr: an extension goes after the whole base sequence', async () => {
    const b = await body(await read(p(r('x', '<w:kern w:val="2"/>' +
      '<w:sz w:val="20"/><w:szCs w:val="20"/>' +
      '<w14:ligatures w14:val="standard"/>'))));
    const rPr = kid(kid(kid(b, 'w:p'), 'w:r'), 'w:rPr');
    assert.deepEqual(names(rPr),
      ['w:kern', 'w:sz', 'w:szCs', 'w14:ligatures']);
  });

  it('pPr: an extension before pPrChange; first child too', async () => {
    const b = await body(await read(p(r('x'),
      '<w14:x w14:val="1"/><w:spacing w:after="0"/><w:jc w:val="left"/>' +
      CHG('pPr'))));
    assert.deepEqual(names(kid(kid(b, 'w:p'), 'w:pPr')),
      ['w:spacing', 'w:jc', 'w14:x', 'w:pPrChange']);
  });

  it('two extensions keep their input order', async () => {
    const b = await body(await read(p(r('x', '<w14:b w14:val="1"/>' +
      '<w:i/><w14:a w14:val="1"/><w:b/>'))));
    const rPr = kid(kid(kid(b, 'w:p'), 'w:r'), 'w:rPr');
    assert.deepEqual(names(rPr), ['w:b', 'w:i', 'w14:b', 'w14:a']);
  });

  it('sectPr: extensions after the base, before sectPrChange',
    async () => {
      const sect = '<w15:footnoteColumns w15:val="1"/>' +
        '<w:sectPrChange w:id="2" w:author="a"><w:sectPr/>' +
        '</w:sectPrChange><w:pgMar w:top="1"/><w:pgSz w:w="1" w:h="2"/>';
      const b = await body(await read(p(r('a'), '<w:sectPr>' + sect +
        '</w:sectPr>') + p(r('b')) + '<w:sectPr>' + sect +
        '</w:sectPr>'));
      const want = ['w:pgSz', 'w:pgMar', 'w15:footnoteColumns',
        'w:sectPrChange'];
      assert.deepEqual(names(kid(kid(kids(b, 'w:p')[0], 'w:pPr'),
        'w:sectPr')), want);
      assert.deepEqual(names(kid(b, 'w:sectPr')), want);
    });
});

const RAW_RPR = '<w:color w:val="1F3864" w:themeColor="accent1"/>' +
  '<w:rFonts w:asciiTheme="minorHAnsi" w:ascii="Calibri"/>' +
  '<w:sz w:val="1.5"/>';
const RAW_PPR = '<w:spacing w:before="0" w:beforeAutospacing="1" ' +
  'w:after="0"/><w:jc w:val="left" w:odd="1"/>';

describe('Edits replace raw property elements', () => {
  it('setting color/spacing/rFonts drops the raw element', async () => {
    const doc = await read(p(r('xy', RAW_RPR), RAW_PPR));
    const q = doc.sections[0].blocks[0];
    assert.equal(q.runs[0].rPr.extra.length, 3);
    const d = new Document(doc);
    d.apply({op: 'setProps', block: [0, 0], pPr: {spacing: {after: 240}},
      rPr: {color: 'FF0000', rFonts: {ascii: 'Arial'}}});
    const b = await body(d.doc);
    const wp = kid(b, 'w:p');
    const rPr = kid(kid(wp, 'w:r'), 'w:rPr');
    assert.deepEqual(names(rPr), ['w:rFonts', 'w:color', 'w:sz']);
    assert.deepEqual(kid(rPr, 'w:color').attrs, [['w:val', 'FF0000']]);
    const pPr = kid(wp, 'w:pPr');
    assert.deepEqual(names(pPr), ['w:spacing', 'w:jc']);
    assert.deepEqual(kid(pPr, 'w:spacing').attrs, [['w:after', '240']]);
    const back = await readDocx(await writeDocx(d.doc, {date: DATE}));
    const q2 = back.sections[0].blocks[0];
    assert.equal(q2.runs[0].rPr.color, 'FF0000');
    assert.deepEqual(q2.runs[0].rPr.rFonts, {ascii: 'Arial'});
    assert.deepEqual(q2.pPr.spacing, {after: 240});
    d.undo();
    assert.ok(deepEqual(d.doc.sections[0].blocks[0], q),
      'undo restores the raw elements exactly');
  });

  it('deleting a field with null drops the raw element too', async () => {
    const doc = await read(p(r('xy', RAW_RPR), RAW_PPR));
    const d = new Document(doc);
    d.apply({op: 'setProps', block: [0, 0], range: {start: 0, end: 1},
      rPr: {color: null}, pPr: {jc: null}});
    const q = d.doc.sections[0].blocks[0];
    assert.deepEqual(q.runs[0].rPr.extra.map((n) => n.name),
      ['w:rFonts', 'w:sz']);
    assert.deepEqual(q.runs[1].rPr.extra.map((n) => n.name),
      ['w:color', 'w:rFonts', 'w:sz']);
    assert.deepEqual(q.pPr.extra.map((n) => n.name), ['w:spacing']);
  });

  it('setting pStyle/rStyle drops a raw pStyle/rStyle', async () => {
    const doc = await read(p(r('x', '<w:rStyle w:val="A"/>' +
      '<w:rStyle w:val="B"/>'), '<w:pStyle w:val="A"/>' +
      '<w:pStyle w:val="B"/>'));
    const q0 = doc.sections[0].blocks[0];
    assert.equal(q0.pPr.extra.length, 2);
    const d = new Document(doc);
    d.apply({op: 'setProps', block: [0, 0], pStyle: 'C', rStyle: 'D'});
    const q = d.doc.sections[0].blocks[0];
    assert.deepEqual(q.pPr.extra, []);
    assert.deepEqual(q.runs[0].rPr.extra, []);
    assert.equal(q.pStyle, 'C');
  });

  it('300 random edits: no duplicate children written, edits kept',
    async () => {
      let seed = 42;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const pick = (a) => a[Math.floor(rnd() * a.length)];
      const RP = [['color', () => pick(['FF0000', '00FF00', null])],
        ['rFonts', () => pick([{ascii: 'Arial'}, {hAnsi: 'X'}, null])],
        ['sz', () => pick([20, 24, null])], ['b', () => pick([true,
          false, null])]];
      const PP = [['spacing', () => pick([{after: 240}, {before: 1,
        line: 240}, null])], ['jc', () => pick(['center', 'right',
        null])], ['ind', () => pick([{left: 720}, null])]];
      const src = p(r('alpha ', RAW_RPR) + r('beta', '<w:b/>' + RAW_RPR),
        RAW_PPR) + p(r('gamma', RAW_RPR), RAW_PPR);
      for (let k = 0; k < 300; k++) {
        const d = new Document(await read(src));
        const steps = 1 + Math.floor(rnd() * 4);
        for (let s = 0; s < steps; s++) {
          const block = [0, Math.floor(rnd() * 2)];
          const q = d.doc.sections[0].blocks[block[1]];
          const a = Math.floor(rnd() * q.text.length);
          const e = a + 1 + Math.floor(rnd() * (q.text.length - a));
          const [rk, rv] = pick(RP);
          const [pk, pv] = pick(PP);
          d.apply({op: 'setProps', block, range: {start: a, end: e},
            rPr: {[rk]: rv()}, pPr: {[pk]: pv()}});
        }
        const b = await body(d.doc);
        for (const wp of kids(b, 'w:p')) {
          const conts = [kid(wp, 'w:pPr'),
            ...kids(wp, 'w:r').map((x) => kid(x, 'w:rPr'))];
          for (const c of conts.filter(Boolean)) {
            const ns = names(c);
            assert.equal(new Set(ns).size, ns.length,
              'seed step ' + k + ': ' + ns.join(' '));
          }
        }
        const back = await readDocx(await writeDocx(d.doc,
          {date: DATE}));
        d.doc.sections[0].blocks.forEach((q, i) => {
          const g = back.sections[0].blocks[i];
          assert.equal(g.text, q.text);
          for (const f of ['spacing', 'jc', 'ind']) {
            assert.deepEqual(g.pPr[f], q.pPr[f], k + ' pPr ' + f);
          }
          for (let at = 0; at < q.text.length; at++) {
            const fr = (x) => x.runs.find((u) => u.start <= at &&
              at < u.end).rPr;
            for (const f of ['color', 'rFonts', 'sz', 'b']) {
              assert.deepEqual(fr(g)[f], fr(q)[f], k + ' rPr ' + f);
            }
          }
        });
      }
    });
});
