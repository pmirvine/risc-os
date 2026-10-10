// NumWrite: the numbering part made when missing (name, relationship,
// conformance) and extended when present (new w:abstractNum after
// the last abstract, new w:num before w:numIdMacAtCleanup, every old
// child the same node, ids fresh and < 2^31, nsid unique), restarts,
// and the written part read back.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {ensurePart, addList, addRestart}
  from '../../tools/moreapps/!Word/NumWrite';
import {entryOf} from '../../tools/moreapps/!Word/ListGallery';
import {readNumbering} from '../../tools/moreapps/!Word/ReadNumbering';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {rootScope} from '../../tools/moreapps/!Word/Ns';
import {NS} from '../../tools/moreapps/!Word/Wml';
import {emptyDoc, newPara}
  from '../../tools/moreapps/!Word/Model';
import {apply} from '../../tools/moreapps/!Word/Ops';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx, newDoc} from '../../tools/moreapps/!Word/DocxWrite';
import {relKind} from '../../tools/moreapps/!Word/Rels';
import {parseXml, serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {numberingXml, STRICT_W_NS, STRICT_REL, REL, p, r}
  from './build-docx.mjs';
import {strictDocx} from './docx-fixtures.mjs';
import {listDocx, NUMBERING, lvl} from './list-fixtures.mjs';
import {entryText} from './docx-compare.mjs';
import {schemaChecker} from './roundtrip-lib.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const write = (doc) => writeDocx(doc, {date: DATE});
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const LIMIT = 2 ** 31;

const rootOf = (xml) => parseXml(xml).root;
const numberingOf = (xml) => {
  const root = rootOf(xml);
  return readNumbering(root, rootScope(root));
};
const els = (n) => n.children.filter((c) => typeof c === 'object' &&
  c.name !== undefined);
const attr = (n, k) => (n.attrs.find(([a]) => a === k) || [])[1];
const absXml = (id, nsid = '') => `<w:abstractNum w:abstractNumId="${id
}">${nsid ? `<w:nsid w:val="${nsid}"/>` : ''}` +
  '<w:multiLevelType w:val="hybridMultilevel"/>' + lvl(0) +
  '</w:abstractNum>';
const numXml = (id, a) => `<w:num w:numId="${id}">` +
  `<w:abstractNumId w:val="${a}"/></w:num>`;
const pict = '<w:numPicBullet w:numPicBulletId="0"><w:pict/>' +
  '</w:numPicBullet>';

// a part as Word writes it: picture bullets inside mc:AlternateContent,
// an abstract in an mc:Choice, white space, numIdMacAtCleanup last
const WORD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  `<w:numbering xmlns:w="${NS.w}" xmlns:mc="${MC}" xmlns:w14="${W14}"` +
  ' mc:Ignorable="w14">\n' +
  `<mc:AlternateContent><mc:Choice Requires="w14">${pict}</mc:Choice>` +
  `<mc:Fallback>${pict}</mc:Fallback></mc:AlternateContent>\n` +
  absXml(0, '1A2B3C4D') + '\n' +
  '<mc:AlternateContent><mc:Choice Requires="w14">' +
  absXml(3, '0000ABCD') + '</mc:Choice><mc:Fallback/>' +
  '</mc:AlternateContent>\n' +
  numXml(1, 0) + '\n' + numXml(4, 3) + '\n' +
  '<w:numIdMacAtCleanup w:val="2"/>\n</w:numbering>';

/** A Doc with `numbering` set up by ensurePart's result. */
function withParts(doc, got) {
  apply(doc, {op: 'setDocPart', key: 'numbering', value: got.numbering});
  apply(doc, {op: 'setDocPart', key: 'rels', value: got.rels});
  apply(doc, {op: 'setDocPart', key: 'numberingPart',
    value: got.numberingPart});
  return doc;
}

/** Make a list of `id` in `doc` (ensurePart + addList), set it. */
function makeList(doc, id, opts) {
  const got = ensurePart(doc);
  const add = addList(got.numbering, entryOf(id), opts);
  withParts(doc, {...got, numbering: add.numbering});
  return add;
}

describe('NumWrite.ensurePart', () => {
  it('a new document: a new root, word/numbering.xml, a relationship',
    () => {
      const d = newDoc({date: DATE});
      const before = structuredClone(d);
      const rels = d.rels;
      const got = ensurePart(d);
      assert.deepEqual(d, before, 'the doc is not changed');
      assert.equal(got.numberingPart, 'word/numbering.xml');
      assert.deepEqual(got.numbering.raw, {name: 'w:numbering',
        attrs: [['xmlns:w', NS.w]], children: []});
      assert.equal(got.numbering.nums.size, 0);
      assert.notEqual(got.rels, rels, 'a new array');
      assert.equal(got.rels.length, rels.length + 1);
      rels.forEach((x, k) => assert.equal(got.rels[k], x, 'same rel'));
      const n = got.rels.at(-1);
      assert.deepEqual(relKind(n.type), {kind: 'numbering', strict: false});
      assert.equal(n.target, 'numbering.xml');
      assert.ok(!rels.some((x) => x.id === n.id));
    });

  it('a document with a numbering part: the same objects back', async () => {
    const d = await readDocx(await listDocx([p(r('x'))]));
    const got = ensurePart(d);
    assert.equal(got.numbering, d.numbering);
    assert.equal(got.rels, d.rels);
    assert.equal(got.numberingPart, d.meta.numberingPart);
  });

  it('a name another part has is never taken (case ignored)', () => {
    const d = newDoc({date: DATE});
    d.parts = new Map([...d.parts, ['Word/Numbering.xml',
      new Uint8Array(1)], ['word/numbering2.xml', new Uint8Array(1)]]);
    d.meta = {...d.meta, contentTypes: {...d.meta.contentTypes,
      overrides: [...d.meta.contentTypes.overrides,
        ['/word/numbering3.xml', 'application/x-other']]}};
    const got = ensurePart(d);
    assert.equal(got.numberingPart, 'word/numbering4.xml');
    assert.equal(got.rels.at(-1).target, 'numbering4.xml');
  });

  it('a numbering relationship to a missing part: its name, no new rel',
    () => {
      const d = newDoc({date: DATE});
      d.rels = [...d.rels, {id: 'rId9', type: REL('numbering'),
        target: 'lists.xml', attrs: [['Id', 'rId9'],
          ['Type', REL('numbering')], ['Target', 'lists.xml']]}];
      const got = ensurePart(d);
      assert.equal(got.numberingPart, 'word/lists.xml');
      assert.equal(got.rels, d.rels);
    });

  it('a numbering relationship to another part: a new one, read first',
    async () => {
      const d = newDoc({date: DATE});
      const bad = {id: 'rId9', type: REL('numbering'),
        target: 'styles.xml', attrs: [['Id', 'rId9'],
          ['Type', REL('numbering')], ['Target', 'styles.xml']]};
      d.rels = [...d.rels, bad];
      makeList(d, '1.');
      assert.equal(d.meta.numberingPart, 'word/numbering.xml');
      assert.ok(d.rels.includes(bad), 'the old one is kept');
      const back = await readDocx(await write(d));
      assert.equal(back.meta.numberingPart, 'word/numbering.xml');
      assert.equal(back.numbering.nums.size, 1);
    });

  it('a Doc without package data is refused', () => {
    assert.throws(() => ensurePart(emptyDoc()), RangeError);
  });

  it('Strict: Strict relationship type, namespaces on write', async () => {
    const d = await readDocx(await strictDocx());
    assert.equal(d.meta.conformance, 'strict');
    const {numId} = makeList(d, 'I.', {strict: true});
    assert.deepEqual(relKind(d.rels.at(-1).type),
      {kind: 'numbering', strict: true});
    const bytes = await write(d);
    const xml = await entryText(bytes, 'word/numbering.xml');
    assert.ok(xml.includes(`xmlns:w="${STRICT_W_NS}"`), xml.slice(0, 200));
    assert.ok(!xml.includes(NS.w));
    // Strict attribute values and names: w:start, lvlJc start / end
    assert.ok(xml.includes('<w:ind w:start="720" w:hanging="360"/>'));
    assert.ok(xml.includes('<w:lvlJc w:val="end"/>'));
    assert.ok(xml.includes('<w:lvlJc w:val="start"/>'));
    assert.ok(!/w:left=|"left"|"right"/.test(xml), 'no Transitional form');
    const rels = await entryText(bytes, 'word/_rels/document.xml.rels');
    assert.ok(rels.includes(`Type="${STRICT_REL('numbering')}"`));
    const ct = await entryText(bytes, '[Content_Types].xml');
    assert.ok(ct.includes('PartName="/word/numbering.xml" ContentType=' +
      '"application/vnd.openxmlformats-officedocument.' +
      'wordprocessingml.numbering+xml"'));
    const back = await readDocx(bytes);
    assert.deepEqual(back.numbering.nums, d.numbering.nums);
    assert.ok(back.numbering.nums.has(numId));
  });
});

describe('NumWrite.addList', () => {
  it('no part: abstract 0, num 1, exactly Word\'s form', () => {
    const d = newDoc({date: DATE});
    const got = ensurePart(d);
    const add = addList(got.numbering, entryOf('disc'),
      {rand: () => 0x12AB34CD});
    assert.equal(add.abstractNumId, 0);
    assert.equal(add.numId, 1);
    const [abs, num] = els(add.numbering.raw);
    const xml = serialize(abs);
    assert.ok(xml.startsWith('<w:abstractNum w:abstractNumId="0">' +
      '<w:nsid w:val="12AB34CD"/>' +
      '<w:multiLevelType w:val="hybridMultilevel"/>' +
      '<w:lvl w:ilvl="0"><w:start w:val="1"/>' +
      '<w:numFmt w:val="bullet"/><w:lvlText w:val="\uF0B7"/>' +
      '<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" ' +
      'w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" ' +
      'w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl>' +
      '<w:lvl w:ilvl="1">'), xml.slice(0, 600));
    assert.equal(els(abs).filter((c) => c.name === 'w:lvl').length, 9);
    assert.equal(serialize(num), '<w:num w:numId="1">' +
      '<w:abstractNumId w:val="0"/></w:num>');
    // a numbering: no rPr
    const n2 = addList(add.numbering, entryOf('1.'));
    const lv = els(els(n2.numbering.raw)[1]).find((c) =>
      c.name === 'w:lvl');
    assert.equal(serialize(lv), '<w:lvl w:ilvl="0"><w:start w:val="1"/>' +
      '<w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/>' +
      '<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" ' +
      'w:hanging="360"/></w:pPr></w:lvl>');
    assert.deepEqual([n2.abstractNumId, n2.numId], [1, 2]);
    // order: abstracts first, then nums
    assert.deepEqual(els(n2.numbering.raw).map((c) => c.name),
      ['w:abstractNum', 'w:abstractNum', 'w:num', 'w:num']);
  });

  it('Strict: w:start for the indent, lvlJc start / end', () => {
    const tr = addList(null, 'I.');
    const st = addList(null, 'I.', {strict: true});
    const lv = (n, k) => serialize(els(els(n.numbering.raw)[0])[2 + k]);
    assert.ok(lv(st, 0).includes('<w:lvlJc w:val="end"/><w:pPr>' +
      '<w:ind w:start="720" w:hanging="360"/>'), lv(st, 0));
    assert.ok(lv(st, 1).includes('<w:lvlJc w:val="start"/>'));
    assert.ok(lv(tr, 0).includes('<w:lvlJc w:val="right"/><w:pPr>' +
      '<w:ind w:left="720" w:hanging="360"/>'), lv(tr, 0));
    assert.ok(lv(tr, 1).includes('<w:lvlJc w:val="left"/>'));
    // read back the same either way
    assert.deepEqual(st.numbering.nums, tr.numbering.nums);
  });

  it('null numbering is a new root; an entry id is accepted', () => {
    const add = addList(null, '1)');
    assert.equal(add.numbering.raw.name, 'w:numbering');
    assert.equal(add.numbering.nums.get(1).levels[0].lvlText, '%1)');
    assert.throws(() => addList(null, 'nope'), RangeError);
    assert.throws(() => addList(null, {id: 'x', levels: []}), RangeError);
  });

  it('an empty part read from a file', async () => {
    const d = await readDocx(await listDocx([p(r('x'))],
      {numbering: numberingXml('')}));
    const add = addList(d.numbering, 'i.');
    assert.deepEqual([add.abstractNumId, add.numId], [0, 1]);
    assert.equal(add.numbering.raw.attrs, d.numbering.raw.attrs);
  });

  it('Word\'s part: after the last abstract, before numIdMacAtCleanup;'
    + ' every old child the same node', () => {
    const old = numberingOf(WORD);
    const snap = structuredClone(old);
    const oldKids = old.raw.children.slice();
    const text = oldKids.map((c) => typeof c === 'string' ? c
      : serialize(c));
    const add = addList(old, 'disc');
    assert.deepEqual(old, snap, 'the old numbering is unchanged');
    assert.notEqual(add.numbering.raw, old.raw);
    assert.notEqual(add.numbering.raw.children, old.raw.children);
    assert.equal(add.numbering.raw.attrs, old.raw.attrs);
    assert.deepEqual([add.abstractNumId, add.numId], [4, 5]);
    const kids = add.numbering.raw.children;
    assert.equal(kids.length, oldKids.length + 2);
    const rest = kids.filter((c) => !oldKids.includes(c));
    assert.equal(rest.length, 2);
    // old children: same objects, same order, same text
    const kept = kids.filter((c) => oldKids.includes(c));
    kept.forEach((c, k) => {
      assert.equal(c, oldKids[k]);
      assert.equal(typeof c === 'string' ? c : serialize(c), text[k]);
    });
    const names = els(add.numbering.raw).map((c) => c.name +
      (c.name === 'w:abstractNum' ? attr(c, 'w:abstractNumId')
        : c.name === 'w:num' ? attr(c, 'w:numId') : ''));
    assert.deepEqual(names, ['mc:AlternateContent', 'w:abstractNum0',
      'mc:AlternateContent', 'w:abstractNum4', 'w:num1', 'w:num4',
      'w:num5', 'w:numIdMacAtCleanup']);
    // the old nums are the same objects; the new one is derived
    for (const [k, v] of old.nums) assert.equal(add.numbering.nums.get(k), v);
    assert.equal(add.numbering.nums.size, old.nums.size + 1);
    assert.deepEqual(add.numbering.nums,
      readNumbering(add.numbering.raw, rootScope(add.numbering.raw)).nums);
  });

  it('numIdMacAtCleanup stays last with no num or no abstract', () => {
    const cl = '<w:numIdMacAtCleanup w:val="1"/>';
    const order = (xml) => els(addList(numberingOf(numberingXml(xml)),
      '1.').numbering.raw).map((c) => c.name);
    assert.deepEqual(order(cl), ['w:abstractNum', 'w:num',
      'w:numIdMacAtCleanup']);
    assert.deepEqual(order(absXml(0) + cl), ['w:abstractNum',
      'w:abstractNum', 'w:num', 'w:numIdMacAtCleanup']);
    // out of order (an abstract after it): the new ones still before
    assert.deepEqual(order(cl + absXml(0)), ['w:abstractNum', 'w:num',
      'w:numIdMacAtCleanup', 'w:abstractNum']);
    const r =addRestart(numberingOf(numberingXml(absXml(0) +
      numXml(1, 0) + cl)), 1, 0, 3);
    assert.deepEqual(els(r.numbering.raw).map((c) => c.name),
      ['w:abstractNum', 'w:num', 'w:num', 'w:numIdMacAtCleanup']);
  });

  it('a w:num naming a missing abstract keeps showing nothing', () => {
    const old = numberingOf(numberingXml(absXml(1) + numXml(3, 7)));
    const add = addList(old, '1.');
    assert.equal(add.abstractNumId, 8, 'not 7: num 3 names it');
    assert.equal(add.numId, 4);
    const nums = readNumbering(add.numbering.raw,
      rootScope(add.numbering.raw)).nums;
    assert.deepEqual(nums.get(3).levels, []);
  });

  it('ids: non-numeric ignored, leading zeros counted, used numIds',
    () => {
      const old = numberingOf(numberingXml(absXml('x') + absXml('007') +
        numXml('y', 'x') + numXml('010', '007')));
      const add = addList(old, '1.');
      assert.deepEqual([add.abstractNumId, add.numId], [8, 11]);
      const more = addList(old, '1.', {usedNumIds: [11, 40, 'z']});
      assert.equal(more.numId, 41);
      // only integers count
      const odd = addList(old, '1.', {usedNumIds: [30.5, NaN, Infinity,
        -Infinity, '30.5', '1e3', null, {}, 20]});
      assert.equal(odd.numId, 21);
    });

  it('ids at the limit: up to 2^31 - 1, refused past it', () => {
    const top = LIMIT - 2;
    const ok = addList(numberingOf(numberingXml(absXml(top) +
      numXml(top, top))), '1.');
    assert.deepEqual([ok.abstractNumId, ok.numId], [LIMIT - 1, LIMIT - 1]);
    for (const xml of [absXml(LIMIT - 1) + numXml(1, LIMIT - 1),
      absXml(0) + numXml(LIMIT - 1, 0), absXml(0) + numXml(1, LIMIT),
      absXml('99999999999999999999') + numXml(1, 0)]) {
      const old = numberingOf(numberingXml(xml));
      const snap = structuredClone(old);
      assert.throws(() => addList(old, '1.'), RangeError, xml);
      assert.deepEqual(old, snap);
    }
    assert.throws(() => addList(null, '1.', {usedNumIds: [LIMIT - 1]}),
      RangeError);
  });

  it('nsid: 8 hex digits, never one the part has', () => {
    const old = numberingOf(WORD);
    const seq = [0x1A2B3C4D, 0xABCD, 0x1A2B3C4D, 0x5];
    const add = addList(old, '1.', {rand: () => seq.shift()});
    const abs = els(add.numbering.raw).find((c) =>
      attr(c, 'w:abstractNumId') === '4');
    assert.equal(attr(els(abs)[0], 'w:val'), '00000005');
    // with Math.random: well formed, different from the old ones
    const a2 = addList(add.numbering, '1.');
    const ids = els(a2.numbering.raw).filter((c) =>
      c.name === 'w:abstractNum').map((c) => attr(els(c)[0], 'w:val'));
    assert.ok(ids.every((v) => /^[0-9A-F]{8}$/.test(v)), ids.join());
    assert.equal(new Set(ids).size, ids.length);
    // a rand that keeps clashing still ends
    const stuck = addList(old, '1.', {rand: () => 0x1A2B3C4D});
    const s = els(stuck.numbering.raw).find((c) =>
      attr(c, 'w:abstractNumId') === '4');
    assert.notEqual(attr(els(s)[0], 'w:val'), '1A2B3C4D');
  });

  it('a root binding w elsewhere: the new nodes declare w', () => {
    const xml = `<x:numbering xmlns:x="${NS.w}" xmlns:w="urn:other">` +
      '<x:abstractNum x:abstractNumId="0"/><x:num x:numId="1">' +
      '<x:abstractNumId x:val="0"/></x:num></x:numbering>';
    const add = addList(numberingOf(xml), '1.');
    assert.deepEqual([add.abstractNumId, add.numId], [1, 2]);
    const nums = readNumbering(add.numbering.raw,
      rootScope(add.numbering.raw)).nums;
    assert.equal(nums.get(2).levels[0].lvlText, '%1.');
    assert.equal(nums.get(2).abstractNumId, 1);
  });

  it('10,000 abstracts: under 50 ms', () => {
    let inner = '';
    for (let k = 0; k < 10000; k++) inner += absXml(k, 'A'.repeat(4) +
      k.toString(16).toUpperCase().padStart(4, '0'));
    for (let k = 0; k < 10000; k++) inner += numXml(k + 1, k);
    const old = numberingOf(numberingXml(inner));
    let best = Infinity, add;
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      add = addList(old, '1.');
      best = Math.min(best, performance.now() - t);
    }
    assert.deepEqual([add.abstractNumId, add.numId], [10000, 10001]);
    assert.ok(best < 50, best + ' ms');
  });

  it('the written part validates against wml.xsd (xmllint)', (t) => {
    const x = schemaChecker();
    if (typeof x === 'string') return t.skip(x);
    try {
      let n = null;
      for (const id of ['disc', 'circle', 'check', '1.', 'I.', 'a)'])
        n = addList(n, id).numbering;
      n = addRestart(n, 2, 0, 4).numbering;
      const bytes = new TextEncoder().encode(serialize(n.raw));
      assert.deepEqual([...x.errors(bytes)], []);
      // Word's part: no error added
      const old = numberingOf(WORD);
      const enc = (root) => new TextEncoder().encode(serialize(root));
      const was = x.errors(enc(old.raw));
      const now = x.errors(enc(addRestart(addList(old, '1.').numbering,
        1, 0, 3).numbering.raw));
      assert.deepEqual([...now].filter((e) => !was.has(e)), []);
    } finally {
      x.done();
    }
  });
});

describe('NumWrite: labels and the round trip', () => {
  it('a new list in a new document: labels, written, read back',
    async () => {
      const d = newDoc({date: DATE});
      const {numId} = makeList(d, '1.');
      const {numId: b} = makeList(d, 'disc');
      d.sections[0].blocks = [0, 1, 2, 1, 0].map((k) =>
        newPara('n', {pPr: {numPr: {numId, ilvl: k}}}))
        .concat([0, 1, 2].map((k) =>
          newPara('b', {pPr: {numPr: {numId: b, ilvl: k}}})));
      const texts = (doc) => {
        const m = labels(doc);
        return doc.sections[0].blocks.map((x) => m.get(x.id).text);
      };
      const want = ['1.', 'a.', 'i.', 'b.', '2.', '\u2022', '\u25E6',
        '\u25AA'];
      assert.deepEqual(texts(d), want);
      const bytes = await write(d);
      const back = await readDocx(bytes);
      assert.equal(back.meta.numberingPart, 'word/numbering.xml');
      assert.deepEqual(back.numbering.nums, d.numbering.nums);
      assert.deepEqual(texts(back), want);
      const ct = await entryText(bytes, '[Content_Types].xml');
      assert.ok(ct.includes('/word/numbering.xml'));
      // written again: the same bytes
      const again = await write(back);
      assert.deepEqual(await entryText(again, 'word/numbering.xml'),
        await entryText(bytes, 'word/numbering.xml'));
    });

  it('Word\'s part extended: old children written as they were',
    async () => {
      const d = await readDocx(await listDocx([p(r('x'))],
        {numbering: WORD}));
      const oldKids = d.numbering.raw.children.slice();
      makeList(d, 'A.');
      const xml = await entryText(await write(d), 'word/numbering.xml');
      for (const c of oldKids) {
        if (typeof c !== 'string') assert.ok(xml.includes(serialize(c)));
      }
      const back = await readDocx(await write(d));
      assert.deepEqual(back.numbering.nums, d.numbering.nums);
    });

  it('the list fixtures\' part: nums kept, the new one added', () => {
    const old = numberingOf(NUMBERING);
    const add = addList(old, 'square');
    assert.deepEqual([add.abstractNumId, add.numId], [6, 8]);
    assert.deepEqual(add.numbering.nums,
      readNumbering(add.numbering.raw, rootScope(add.numbering.raw)).nums);
  });
});

describe('NumWrite.addRestart', () => {
  it('a new num on the same abstract with a startOverride', () => {
    const a = addList(null, '1.');
    const old = a.numbering;
    const snap = structuredClone(old);
    const got = addRestart(old, a.numId, 0, 1);
    assert.deepEqual(old, snap);
    assert.equal(got.numId, 2);
    const num = els(got.numbering.raw).at(-1);
    assert.equal(addRestart(old, a.numId, 0, 1, {usedNumIds: [6]}).numId,
      7);
    assert.equal(serialize(num), '<w:num w:numId="2">' +
      '<w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0">' +
      '<w:startOverride w:val="1"/></w:lvlOverride></w:num>');
    assert.equal(got.numbering.nums.get(1), old.nums.get(1));
    assert.deepEqual(got.numbering.nums,
      readNumbering(got.numbering.raw, rootScope(got.numbering.raw)).nums);
    // labels: 1. 2. then the restart 1. 2.; a "start at 5" num gives 5.
    const at5 = addRestart(got.numbering, 1, 0, 5);
    const paras = [1, 1, 2, 2, at5.numId].map((n) =>
      newPara('x', {pPr: {numPr: {numId: n, ilvl: 0}}}));
    const doc = {...emptyDoc(), numbering: at5.numbering};
    doc.sections[0].blocks = paras;
    const m = labels(doc);
    assert.deepEqual(paras.map((x) => m.get(x.id).text),
      ['1.', '2.', '1.', '2.', '5.']);
  });

  it('before numIdMacAtCleanup; Word\'s part keeps its children', () => {
    const old = numberingOf(WORD);
    const got = addRestart(old, 4, 2, 7);
    assert.equal(got.numId, 5);
    const names = els(got.numbering.raw).map((c) => c.name);
    assert.deepEqual(names.slice(-2), ['w:num', 'w:numIdMacAtCleanup']);
    const n = got.numbering.nums.get(5);
    assert.equal(n.abstractNumId, 3);
    assert.equal(n.overrides.get(2).start, 7);
    assert.deepEqual(got.numbering.nums,
      readNumbering(got.numbering.raw, rootScope(got.numbering.raw)).nums);
  });

  it('only the source num\'s level replacements are kept, never its'
    + ' other levels\' startOverride', () => {
    const old = numberingOf(numberingXml(absXml(0) +
      '<w:num w:numId="1"><w:abstractNumId w:val="0"/>' +
      '<w:lvlOverride w:ilvl="3">' + lvl(3, {fmt: 'upperLetter',
        text: '%4>'}) + '</w:lvlOverride>' +
      '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="9"/>' +
      '</w:lvlOverride><w:lvlOverride w:ilvl="1">' +
      '<w:startOverride w:val="4"/></w:lvlOverride>' +
      '<w:lvlOverride w:ilvl="2"><w:startOverride w:val="7"/>' +
      lvl(2, {fmt: 'lowerRoman', text: '(%3)'}) + '</w:lvlOverride>' +
      '</w:num>'));
    const src = els(old.raw).find((c) => c.name === 'w:num');
    const [, o3, , , o2] = els(src);
    const got = addRestart(old, 1, 1, 2);
    const num = els(got.numbering.raw).at(-1);
    const kids = els(num);
    assert.deepEqual(kids.map((c) => c.name), ['w:abstractNumId',
      'w:lvlOverride', 'w:lvlOverride', 'w:lvlOverride']);
    assert.deepEqual(kids.slice(1).map((c) => String(c.attrs[0][1])),
      ['1', '2', '3']);
    assert.equal(serialize(kids[1]), '<w:lvlOverride w:ilvl="1">' +
      '<w:startOverride w:val="2"/></w:lvlOverride>');
    assert.equal(kids[3], o3, 'level 3 replacement: the same node');
    // level 2: its w:lvl kept (the same node), its startOverride not
    assert.notEqual(kids[2], o2);
    assert.deepEqual(els(kids[2]), [els(o2)[1]]);
    assert.equal(els(kids[2])[0], els(o2)[1]);
    assert.deepEqual(got.numbering.nums,
      readNumbering(got.numbering.raw, rootScope(got.numbering.raw)).nums);
    const n = got.numbering.nums.get(got.numId);
    assert.deepEqual([...n.overrides.keys()], [1, 2, 3]);
    assert.equal(n.overrides.get(1).start, 2);
    assert.equal(n.overrides.get(2).start, undefined);
    assert.equal(n.overrides.get(2).level.lvlText, '(%3)');
    assert.equal(n.overrides.get(3).level.lvlText, '%4>');
    // restarting level 0: level 1's startOverride is not carried
    const again = addRestart(old, 1, 0, 5);
    const k2 = els(els(again.numbering.raw).at(-1));
    assert.equal(k2.length, 4);
    assert.equal(serialize(k2[1]), '<w:lvlOverride w:ilvl="0">' +
      '<w:startOverride w:val="5"/></w:lvlOverride>');
    assert.deepEqual([...again.numbering.nums.get(again.numId)
      .overrides.keys()], [0, 2, 3]);
  });

  it('refuses bad input', () => {
    const {numbering} = addList(null, '1.');
    for (const [id, k, s] of [[9, 0, 1], [1, -1, 1], [1, 9, 1],
      [1, 0.5, 1], [1, 0, -1], [1, 0, LIMIT], [1, 0, 1.5], [1, '0', 1]])
      assert.throws(() => addRestart(numbering, id, k, s), RangeError,
        `${id} ${k} ${s}`);
    assert.throws(() => addRestart(null, 1, 0, 1), RangeError);
    // a num that names no abstract
    const odd = numberingOf(numberingXml('<w:num w:numId="1"/>'));
    assert.throws(() => addRestart(odd, 1, 0, 1), RangeError);
  });
});
