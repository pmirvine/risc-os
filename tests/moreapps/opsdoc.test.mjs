// OpsDoc (setDocPart) and DocParts (freshRelId, addRel, withStyle,
// findStyle): document-level parts replaced, never changed.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc, deepEqual} from '../../tools/moreapps/!Word/Model';
import {apply, applyOwn} from '../../tools/moreapps/!Word/Ops';
import {Document} from '../../tools/moreapps/!Word/Document';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx, newDoc} from '../../tools/moreapps/!Word/DocxWrite';
import {freshRelId, addRel, withStyle, findStyle}
  from '../../tools/moreapps/!Word/DocParts';
import {stepEnd} from '../../tools/moreapps/!Word/EditApply';
import {relKind} from '../../tools/moreapps/!Word/Rels';
import {serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {strictDocx, STYLES} from './docx-fixtures.mjs';
import {entries, entryText} from './docx-compare.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const write = (doc) => writeDocx(doc, {date: DATE});
const node = (name, attrs = [], children = []) =>
  ({name, attrs, children});
const NUMBERING = () => ({raw: node('w:numbering', [['xmlns:w',
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main']], [
  node('w:abstractNum', [['w:abstractNumId', '0']], [
    node('w:lvl', [['w:ilvl', '0']], [
      node('w:numFmt', [['w:val', 'decimal']]),
      node('w:lvlText', [['w:val', '%1.']])])]),
  node('w:num', [['w:numId', '1']], [
    node('w:abstractNumId', [['w:val', '0']])])]),
nums: new Map()});

describe('setDocPart', () => {
  it('replaces each part; the inverse holds the old value', () => {
    const d = newDoc();
    const values = {
      numbering: NUMBERING(),
      rels: addRel(d.rels, {kind: 'numbering', target: 'numbering.xml'})
        .rels,
      styles: withStyle(d.styles, {id: 'New', type: 'paragraph',
        name: 'New'}),
      settings: node('w:settings'),
      numberingPart: 'word/numbering.xml',
    };
    const field = {settings: 'rawSettings'};
    for (const [key, value] of Object.entries(values)) {
      const before = structuredClone(d);
      const meta = d.meta;
      const f = field[key] || key;
      const old = key === 'numberingPart' ? undefined : d[f];
      const inv = apply(d, {op: 'setDocPart', key, value});
      assert.equal(inv.op, 'setDocPart');
      assert.equal(inv.key, key);
      assert.equal(inv.value, old, key + ': the old value itself');
      if (key === 'numberingPart') {
        assert.equal(d.meta.numberingPart, value);
        assert.notEqual(d.meta, meta, 'meta replaced');
        assert.ok(!Object.hasOwn(meta, 'numberingPart'),
          'old meta unchanged');
      } else {
        assert.ok(deepEqual(d[f], value), key);
        assert.equal(d.meta, meta, 'meta untouched');
      }
      applyOwn(d, inv);
      assert.ok(deepEqual(d, before), key + ': inverse restores');
      if (key === 'numberingPart') {
        assert.ok(!Object.hasOwn(d.meta, 'numberingPart'),
          'the key is removed again');
      } else assert.equal(d[f], old, key + ': the same object back');
    }
  });

  it('a value undefined removes numberingPart; null is kept', () => {
    const d = emptyDoc();
    d.meta = {numberingPart: 'word/numbering.xml', x: 1};
    const inv = apply(d, {op: 'setDocPart', key: 'numberingPart'});
    assert.deepEqual(d.meta, {x: 1});
    applyOwn(d, inv);
    assert.deepEqual(d.meta, {numberingPart: 'word/numbering.xml', x: 1});
    const inv2 = apply(d, {op: 'setDocPart', key: 'numberingPart',
      value: null});
    assert.deepEqual(d.meta, {numberingPart: null, x: 1});
    applyOwn(d, inv2);
    assert.equal(d.meta.numberingPart, 'word/numbering.xml');
  });

  it('refuses other keys and bad values; doc unchanged', () => {
    const d = newDoc();
    const before = structuredClone(d);
    const bad = [
      ['__proto__', {}], ['meta', {}],
      ['constructor', null], ['toString', null], ['sections', []],
      ['rawSettings', null], [7, null], [undefined, null],
      ['numbering', {raw: 'x', nums: new Map()}],
      ['numbering', {raw: node('w:numbering'), nums: {}}],
      ['numbering', undefined],
      ['rels', 'x'], ['rels', [{id: 'rId1'}]],
      ['rels', [{id: 'a', type: 't', target: 'x'},
        {id: 'a', type: 't', target: 'y'}]],
      ['rels', [{id: '', type: 't', target: 'x'}]],
      ['rels', [{id: 'a', type: 't', target: 'x', attrs: 'x'}]],
      ['styles', {}], ['styles', {styles: {}, docDefaults: {},
        defaults: {}}],
      ['settings', 'w:settings'], ['settings', {name: 'w:settings'}],
      ['numberingPart', ''], ['numberingPart', '/word/n.xml'],
      ['numberingPart', 'word/../n.xml'], ['numberingPart', 'a\\b'],
      ['numberingPart', 'word//n.xml'], ['numberingPart', 'a\nb'],
      ['numberingPart', 7], ['numberingPart', 'x'.repeat(300)],
    ];
    for (const [key, value] of bad) {
      assert.throws(() => apply(d, {op: 'setDocPart', key, value}),
        RangeError, String(key));
      assert.ok(deepEqual(d, before), String(key));
    }
    assert.equal(Object.getPrototypeOf(d), Object.prototype);
  });

  it('in Document: one undo step, a change event, the caret kept',
    () => {
      const d = new Document(newDoc());
      const before = structuredClone(d.doc);
      let ev = null;
      d.on('change', (e) => { ev = e; });
      d.apply({op: 'setDocPart', key: 'numbering', value: NUMBERING()});
      assert.equal(ev.ops[0].op, 'setDocPart');
      assert.equal(stepEnd(d.doc, ev.ops, null), null);
      d.undo();
      assert.ok(deepEqual(d.doc, before));
      assert.equal(stepEnd(d.doc, ev.ops, null), null);
      // a setDocPart after a paragraph op: the paragraph op decides
      const id = d.doc.sections[0].blocks[0].id;
      d.group(() => {
        d.apply({op: 'setProps', block: [0, 0], pPr: {jc: 'center'}});
        d.apply({op: 'setDocPart', key: 'numbering',
          value: NUMBERING()});
      });
      assert.deepEqual(stepEnd(d.doc, ev.ops, null), {id, off: 0});
      d.undo();
      assert.deepEqual(stepEnd(d.doc, ev.ops, null), {id, off: 0});
      assert.ok(deepEqual(d.doc, before));
    });

  it('a numbering part made and written; undo writes none', async () => {
    const d = new Document(newDoc({date: DATE}));
    const plain = await write(d.doc);
    const {rels} = addRel(d.doc.rels, {kind: 'numbering',
      target: 'numbering.xml'});
    d.group(() => {
      d.apply({op: 'setDocPart', key: 'numbering', value: NUMBERING()});
      d.apply({op: 'setDocPart', key: 'rels', value: rels});
      d.apply({op: 'setDocPart', key: 'numberingPart',
        value: 'word/numbering.xml'});
    });
    const bytes = await write(d.doc);
    const z = await entries(bytes);
    assert.ok(z.has('word/numbering.xml'));
    assert.match(await entryText(bytes, '[Content_Types].xml'),
      /PartName="\/word\/numbering.xml" ContentType="[^"]*numbering\+xml"/);
    const back = await readDocx(bytes);
    assert.equal(back.meta.numberingPart, 'word/numbering.xml');
    assert.ok(back.numbering.nums.has(1));
    d.undo();
    assert.deepEqual(await write(d.doc), plain);
  });
});

describe('setDocPart parts (plan R5)', () => {
  const PNG = () => new Uint8Array([137, 80, 78, 71]);
  const withMedia = () => {
    const d = newDoc();
    d.parts = new Map(d.parts).set('word/media/image1.png', PNG());
    return d;
  };

  it('adds a name: the old bytes objects kept; the inverse gives ' +
    'the old Map back', () => {
    const d = withMedia();
    const old = d.parts, bytes = PNG();
    const next = new Map(old).set('word/media/image2.png', bytes);
    const inv = apply(d, {op: 'setDocPart', key: 'parts', value: next});
    assert.equal(d.parts, next);
    for (const [k, v] of old) assert.equal(d.parts.get(k), v, k);
    assert.equal(d.parts.get('word/media/image2.png'), bytes);
    assert.equal(inv.value, old, 'the old Map itself');
    const inv2 = applyOwn(d, inv);
    assert.equal(d.parts, old, 'undo: the same Map object');
    assert.equal(inv2.value, next, 'redo gives the new Map again');
    applyOwn(d, inv2);
    assert.equal(d.parts, next);
  });

  it('in Document: one step; undo restores the same Map', () => {
    const d = new Document(withMedia());
    const old = d.doc.parts;
    d.apply({op: 'setDocPart', key: 'parts', value: new Map(old)
      .set('word/media/image9.gif', PNG())});
    assert.equal(d.undoDepth, 1);
    d.undo();
    assert.equal(d.doc.parts, old);
  });

  it('refused: not a Map, changed bytes, taken or bad names, ' +
    'not bytes; doc unchanged', () => {
    const d = withMedia();
    const before = structuredClone(d), old = d.parts;
    const add = (k, v = PNG()) => new Map(old).set(k, v);
    const bad = [
      ['not a Map', [...old]], ['object', {}], ['null', null],
      ['changed bytes', add('word/media/image1.png')],
      ['main', add('word/document.xml')],
      ['content types', add('[Content_Types].xml')],
      ['rels', add('word/_rels/x.rels')],
      ['case', add('WORD/MEDIA/IMAGE1.PNG')],
      ['styles', add('Word/Styles.xml')],
      ['climb', add('../x.png')], ['absolute', add('/word/x.png')],
      ['empty', add('')], ['backslash', add('word\\x.png')],
      ['not bytes', add('word/media/image2.png', [1, 2])],
      ['string bytes', add('word/media/image2.png', 'x')],
      ['twice', add('word/media/a.png').set('word/media/A.PNG',
        PNG())],
      ['not a string', new Map(old).set(7, PNG())],
      ['drive letter', add('C:/x.png')],
      ['a folder of a part', add('word/media')],
      ['inside a part', add('word/media/image1.png/x.png')],
    ];
    for (const [what, value] of bad) {
      assert.throws(() => apply(d, {op: 'setDocPart', key: 'parts',
        value}), RangeError, what);
      assert.equal(d.parts, old, what);
      assert.deepEqual(d, before, what);
    }
  });

  it('a removed name is taken back by undo; the numbering part ' +
    'name is not free', () => {
    const d = withMedia();
    const old = d.parts;
    const less = new Map(old);
    less.delete('word/media/image1.png');
    const inv = apply(d, {op: 'setDocPart', key: 'parts', value: less});
    applyOwn(d, inv);
    assert.equal(d.parts, old);
    d.meta = {...d.meta, numberingPart: 'word/numbering.xml'};
    assert.throws(() => apply(d, {op: 'setDocPart', key: 'parts',
      value: new Map(old).set('word/Numbering.xml', PNG())}),
    RangeError);
  });
});

describe('setDocPart: review rules', () => {
  it('values are kept by reference (immutable by contract)', () => {
    const d = new Document(newDoc());
    const old = d.doc.styles;
    const t = withStyle(old, {id: 'New', type: 'paragraph'});
    d.apply({op: 'setDocPart', key: 'styles', value: t});
    assert.equal(d.doc.styles, t, 'the very table');
    for (const [k, st] of old.styles) {
      assert.equal(d.doc.styles.styles.get(k), st, k + ' shared');
    }
    const num = NUMBERING();
    d.group(() => d.apply({op: 'compound', ops: [{op: 'setDocPart',
      key: 'numbering', value: num}]}));
    assert.equal(d.doc.numbering, num, 'inside a compound too');
    d.undo();
    assert.equal(d.doc.numbering, null);
    d.redo();
    assert.equal(d.doc.numbering, num);
    d.undo();
    d.undo();
    assert.equal(d.doc.styles, old, 'undo puts the old table back');
    // apply() still copies every other op
    const pPr = {jc: 'center'};
    d.apply({op: 'setProps', block: [0, 0], pPr});
    assert.notEqual(d.doc.sections[0].blocks[0].pPr, pPr);
  });

  it('a part name already used by another part is refused', async () => {
    const d = newDoc();
    const before = structuredClone(d);
    const taken = ['word/document.xml', 'word/styles.xml',
      'word/settings.xml', '[Content_Types].xml', '_rels/.rels',
      'word/_rels/document.xml.rels', 'word/_rels/x.xml.rels',
      'docProps/core.xml', 'WORD/Document.XML', 'Word/Styles.xml',
      ...[...d.parts.keys()]];
    for (const name of taken) {
      assert.throws(() => apply(d, {op: 'setDocPart',
        key: 'numberingPart', value: name}), RangeError, name);
      assert.ok(deepEqual(d, before), name);
    }
    d.meta.contentTypes.overrides.push(['/word/other.xml',
      'application/xml']);
    assert.throws(() => apply(d, {op: 'setDocPart',
      key: 'numberingPart', value: 'word/other.xml'}), RangeError);
    const inv = apply(d, {op: 'setDocPart', key: 'numberingPart',
      value: 'word/numbering.xml'});
    applyOwn(d, inv);
    // a file's own numbering part: removed, then put back by undo
    const doc = await readDocx(await buildDocx({
      'word/document.xml': documentXml(p(r('x'))),
      'word/numbering.xml': serialize(NUMBERING().raw)}));
    assert.equal(doc.meta.numberingPart, 'word/numbering.xml');
    const dd = new Document(doc);
    const snap = structuredClone(doc);
    dd.apply({op: 'setDocPart', key: 'numberingPart'});
    dd.undo();
    assert.ok(deepEqual(dd.doc, snap));
    // the current numbering part's own name is accepted again
    apply(doc, {op: 'setDocPart', key: 'numberingPart',
      value: 'word/numbering.xml'});
  });

  it('settings: refused without a settings part', () => {
    const d = emptyDoc();
    const before = structuredClone(d);
    assert.throws(() => apply(d, {op: 'setDocPart', key: 'settings',
      value: node('w:settings')}), /no settings part/);
    assert.ok(deepEqual(d, before));
    apply(d, {op: 'setDocPart', key: 'settings', value: null});
    const n = newDoc();
    apply(n, {op: 'setDocPart', key: 'settings',
      value: node('w:settings')});
    assert.equal(n.rawSettings.name, 'w:settings');
  });
});

describe('DocParts', () => {
  it('freshRelId skips used ids', () => {
    assert.equal(freshRelId([]), 'rId1');
    assert.equal(freshRelId([{id: 'rId2'}]), 'rId3');
    assert.equal(freshRelId([{id: 'rId1'}]), 'rId2');
    assert.equal(freshRelId([{id: 'rId2'}, {id: 'rId3'}]), 'rId4');
    assert.equal(freshRelId([{id: 'x'}, {id: 'rId2'}]), 'rId3');
  });

  it('addRel: a new array; the old one and its objects unchanged', () => {
    const old = [{id: 'rId1', type: 't', target: 'a', attrs: []}];
    const snap = structuredClone(old);
    const {rels, id} = addRel(old, {kind: 'hyperlink',
      target: 'https://example.com/a b', external: true});
    assert.equal(id, 'rId2');
    assert.notEqual(rels, old);
    assert.deepEqual(old, snap);
    assert.equal(rels[0], old[0]);
    const n = rels[1];
    assert.equal(n.mode, 'External');
    assert.deepEqual(relKind(n.type), {kind: 'hyperlink', strict: false});
    assert.deepEqual(n.attrs, [['Id', 'rId2'], ['Type', n.type],
      ['Target', 'https://example.com/a b'],
      ['TargetMode', 'External']]);
    const internal = addRel(old, {kind: 'numbering',
      target: 'numbering.xml'}).rels[1];
    assert.equal(internal.mode, undefined);
    assert.equal(internal.attrs.length, 3);
    for (const bad of [{kind: '', target: 'x'}, {kind: 'a/b', target: 'x'},
      {kind: '__proto__', target: 'x'}, {kind: 'x'},
      {kind: 'x', target: ''}, {kind: 'x', target: 'a\u0001'},
      {kind: 'x', target: 'y'.repeat(2049)}]) {
      assert.throws(() => addRel(old, bad), RangeError,
        JSON.stringify(bad));
    }
    assert.throws(() => addRel('x', {kind: 'x', target: 'y'}),
      RangeError);
  });

  it('a Strict document keeps Strict relationship types', async () => {
    const doc = await readDocx(await strictDocx());
    assert.equal(doc.meta.conformance, 'strict');
    assert.ok(doc.rels.every((x) => relKind(x.type).strict));
    const {rels, id} = addRel(doc.rels, {kind: 'hyperlink',
      target: 'https://example.com/', external: true,
      strict: doc.meta.conformance === 'strict'});
    apply(doc, {op: 'setDocPart', key: 'rels', value: rels});
    const bytes = await write(doc);
    const xml = await entryText(bytes, 'word/_rels/document.xml.rels');
    assert.ok(!xml.includes('schemas.openxmlformats.org/officeDocument'),
      xml);
    const back = await readDocx(bytes);
    const got = back.rels.find((x) => x.id === id);
    assert.deepEqual(relKind(got.type), {kind: 'hyperlink', strict: true});
    assert.equal(got.mode, 'External');
  });

  it('withStyle: a new table; the old one untouched', async () => {
    const doc = await readDocx(await buildDocx({
      'word/document.xml': documentXml(p(r('x'))),
      'word/styles.xml': STYLES}));
    const old = doc.styles;
    const snap = structuredClone(old);
    const t = withStyle(old, {id: 'Hyperlink', type: 'character',
      name: 'Hyperlink', rPr: {color: '0563C1'}});
    assert.notEqual(t, old);
    assert.notEqual(t.styles, old.styles);
    assert.ok(deepEqual(old, snap), 'old table deep-equal');
    assert.ok(!old.styles.has('Hyperlink'));
    for (const [k, s] of old.styles) assert.equal(t.styles.get(k), s);
    const h = t.styles.get('Hyperlink');
    assert.deepEqual(h.pPr, {extra: []});
    assert.deepEqual(h.extra, []);
    assert.equal(h.raw, null);
    assert.deepEqual(h.rPr.extra, []);
    assert.equal(t.docDefaults, old.docDefaults);
    const first = [...old.styles.keys()][0];
    assert.throws(() => withStyle(old, {id: first, type: 'paragraph'}),
      RangeError);
    const rep = withStyle(old, {id: first, type: 'paragraph'},
      {replace: true});
    assert.equal(rep.styles.get(first).raw, null);
    assert.ok(deepEqual(old, snap));
    assert.throws(() => withStyle(old, {id: '', type: 'paragraph'}),
      RangeError);
    // written: every raw style byte-identical, the new one added
    const d = new Document(doc);
    const plain = await write(d.doc);
    d.apply({op: 'setDocPart', key: 'styles', value: t});
    const xml = await entryText(await write(d.doc), 'word/styles.xml');
    for (const s of old.styles.values()) {
      assert.ok(xml.includes(serialize(s.raw)), s.id);
    }
    assert.match(xml, /w:styleId="Hyperlink"/);
    const back = await readDocx(await write(d.doc));
    assert.equal(back.styles.styles.get('Hyperlink').name, 'Hyperlink');
    d.undo();
    assert.deepEqual(await write(d.doc), plain);
  });

  it('findStyle: by id, else by name (case ignored), else null', () => {
    const t = withStyle(withStyle(newDoc().styles, {id: 'MyStyle',
      type: 'paragraph', name: 'My Style'}), {id: '__proto__',
      type: 'character', name: 'constructor'});
    assert.equal(findStyle(t, 'MyStyle').id, 'MyStyle');
    assert.equal(findStyle(t, 'nope', 'my style').id, 'MyStyle');
    assert.equal(findStyle(t, undefined, 'MY STYLE').id, 'MyStyle');
    assert.equal(findStyle(t, 'nope', 'nope'), null);
    assert.equal(findStyle(t, 'nope'), null);
    assert.equal(findStyle(t, '__proto__').type, 'character');
    assert.equal(findStyle(t, 'x', 'Constructor').id, '__proto__');
    assert.equal(findStyle(t, 'toString', 'hasOwnProperty'), null);
    assert.equal(findStyle(null, 'x', 'y'), null);
  });
});
