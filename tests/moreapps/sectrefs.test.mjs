// SectRefs and setStory (Batch D P6.5, D12): header and footer
// references read from and set in a section's props.extra (the raw
// w:headerReference / w:footerReference nodes, by namespace: Strict
// and any prefix), a reference's story found through the main rels,
// and the setStory op (add, replace, remove a whole story; inverse
// the old value, Map order kept), used in one d.atomic with
// setDocPart rels and setSection, undone to deep-equal.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {refsOf, withRef, storyOfRef, MAX_REFS}
  from '../../tools/moreapps/!Letters/SectRefs';
import {apply} from '../../tools/moreapps/!Letters/Ops';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {docScope} from '../../tools/moreapps/!Letters/WriteBody';
import {freeName} from '../../tools/moreapps/!Letters/StoryWrite';
import {addRel} from '../../tools/moreapps/!Letters/DocParts';
import {newPara, deepEqual, sameStories}
  from '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {p, r, R_NS, STRICT_R_NS, REL, W_NS, buildDocx}
  from './build-docx.mjs';
import {withHeaders, freeze, hdrXml, ftrXml}
  from './story-fixtures.mjs';
import {lintPackage} from './lint-package.mjs';
import {lintAfter} from './lint-after.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const write = (doc) => writeDocx(doc, {date: DATE});
const dec = (b) => new TextDecoder().decode(b);
const H1 = 'word/header1.xml', H2 = 'word/header2.xml';
const F1 = 'word/footer1.xml';
const errors = (zip) => lintPackage(zip).problems
  .filter((q) => q.level === 'error')
  .map((q) => q.rule + ' ' + q.part + ' ' + q.detail);
const local = (n) => n.name.slice(n.name.indexOf(':') + 1);
const node = (name, attrs) => ({name, attrs, children: []});
const ref = (kind, type, id, pre = 'w', rp = 'r') =>
  node(pre + ':' + kind + 'Reference',
    [...(type === null ? [] : [[pre + ':type', type]]),
      [rp + ':id', id]]);
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
/** w and r as Word binds them (the scope of most documents). */
const WR = new Map([['w', W_NS], ['r', R_NS]]);
const GRID = node('w:docGrid', [['w:linePitch', '360']]);

let three;   // default header and footer, first-page header
let strict;  // the same, Strict

before(async () => {
  const hdrs = {default: {hdr: p(r('Head')), ftr: p(r('Foot'))},
    first: p(r('First'))};
  three = freeze(await readDocx(await withHeaders(p(r('body')), hdrs,
    {titlePg: true})));
  strict = freeze(await readDocx(await withHeaders(p(r('body')), hdrs,
    {titlePg: true, strict: true})));
});

describe('refsOf', () => {
  it('reads three references', () => {
    const s = three.sections[0];
    assert.deepEqual(refsOf(s, docScope(three).map), {
      hdr: {default: 'rIdH1', first: 'rIdH2'},
      ftr: {default: 'rIdF1'}});
    // w and r as Word writes them: the same
    assert.deepEqual(refsOf(s, WR), refsOf(s, docScope(three).map));
  });

  it('Strict: the same references', () => {
    assert.equal(strict.meta.conformance, 'strict');
    assert.deepEqual(refsOf(strict.sections[0],
      docScope(strict).map), {hdr: {default: 'rIdH1',
      first: 'rIdH2'}, ftr: {default: 'rIdF1'}});
  });

  it('a node in the Strict relationships namespace of its own', () => {
    const n = {...ref('header', 'even', 'rS'),
      attrs: [['w:type', 'even'], ['s:id', 'rS'],
        ['xmlns:s', STRICT_R_NS]]};
    assert.deepEqual(refsOf({props: {extra: [n]}}, WR).hdr, {even: 'rS'});
  });

  it('any prefix, by namespace', () => {
    const m = new Map([['x', 'http://schemas.openxmlformats.org/' +
      'wordprocessingml/2006/main'], ['rel', R_NS], ['r', 'urn:no']]);
    const extra = [ref('footer', 'even', 'rE', 'x', 'rel'),
      ref('footer', 'first', 'rNo', 'x', 'r'),
      ref('header', 'default', 'rW', 'w', 'rel')];
    // w: is not WML in m; r: is not the relationships namespace
    assert.deepEqual(refsOf({props: {extra}}, m),
      {hdr: {}, ftr: {even: 'rE'}});
  });

  it('"odd", unknown and missing types; no id; repeats', () => {
    const extra = [ref('header', 'odd', 'rO'),
      ref('header', '__proto__', 'rP'), ref('footer', null, 'rD'),
      node('w:headerReference', [['w:type', 'first']]),
      ref('header', 'first', 'rF'), ref('header', 'first', 'rF2'),
      ref('header', 'even', '')];
    const got = refsOf({props: {extra}}, WR);
    // a reference without w:type is a default one (ST_HdrFtr's
    // default as Word reads it); the first with an id wins
    assert.deepEqual(got, {hdr: {first: 'rF'}, ftr: {default: 'rD'}});
    assert.equal(Object.getPrototypeOf(got.hdr), Object.prototype);
    assert.ok(!Object.hasOwn(got.hdr, '__proto__'));
  });

  it('a section without props or extra: none', () => {
    for (const s of [{}, {props: {}}, {props: {extra: null}}, null]) {
      assert.deepEqual(refsOf(s, WR), {hdr: {}, ftr: {}});
    }
  });

  it('at most MAX_REFS reference nodes are looked at', () => {
    const extra = [];
    for (let k = 0; k < MAX_REFS; k++)
      extra.push(ref('header', 'odd', 'r' + k));
    extra.push(ref('header', 'default', 'late'));
    assert.deepEqual(refsOf({props: {extra}}, WR).hdr, {});
    extra.splice(0, 1);
    assert.deepEqual(refsOf({props: {extra}}, WR).hdr,
      {default: 'late'});
  });
});

describe('withRef', () => {
  const props = () => three.sections[0].props;

  it('adds a first-page footer reference in schema order', () => {
    const p0 = props();
    const p1 = withRef(p0, 'ftr', 'first', 'rIdNew', WR);
    assert.notEqual(p1, p0);
    assert.notEqual(p1.extra, p0.extra);
    const names = p1.extra.map((n) => local(n) + ':' +
      n.attrs.find(([k]) => k === 'w:type')?.[1]);
    assert.deepEqual(names.slice(0, 4), ['headerReference:default',
      'headerReference:first', 'footerReference:default',
      'footerReference:first']);
    // the other nodes are the very objects
    for (const n of p0.extra) assert.ok(p1.extra.includes(n));
    assert.equal(refsOf({props: p1}, WR).ftr.first, 'rIdNew');
    // the rest of props shared
    for (const k of Object.keys(p0)) {
      if (k !== 'extra') assert.equal(p1[k], p0[k]);
    }
  });

  it('a first-page header after the last header reference', () => {
    const extra = [ref('header', 'default', 'a'),
      ref('header', 'even', 'b'), ref('footer', 'default', 'c'),
      GRID];
    const p1 = withRef({extra}, 'hdr', 'first', 'n', WR);
    assert.deepEqual(p1.extra.map((n) => n.attrs[1]?.[1] ??
      n.attrs[0][1]), ['a', 'b', 'n', 'c', '360']);
  });

  it('no references yet: before the other children', () => {
    const p1 = withRef({extra: [GRID]}, 'ftr', 'default', 'n', WR);
    assert.equal(local(p1.extra[0]), 'footerReference');
    assert.equal(p1.extra[1], GRID);
    const p2 = withRef(p1, 'hdr', 'even', 'h', WR);
    assert.deepEqual(p2.extra.map(local), ['headerReference',
      'footerReference', 'docGrid']);
    // a header with only footers: before the first footer
    const p3 = withRef({extra: [ref('footer', 'first', 'f')]}, 'hdr',
      'default', 'h', WR);
    assert.deepEqual(p3.extra.map(local), ['headerReference',
      'footerReference']);
  });

  it('replaces: the same place, other attributes kept', () => {
    const odd = node('w:headerReference', [['w:type', 'default'],
      ['r:id', 'old'], ['w14:x', 'keep']]);
    const extra = [odd, ref('footer', 'default', 'f'), GRID];
    const p1 = withRef({extra}, 'hdr', 'default', 'new', WR);
    assert.deepEqual(p1.extra[0].attrs, [['w:type', 'default'],
      ['r:id', 'new'], ['w14:x', 'keep']]);
    assert.equal(p1.extra[1], extra[1]);
    assert.deepEqual(odd.attrs[1], ['r:id', 'old'], 'not in place');
    // the same id: the same props back (no change)
    const same = {extra};
    assert.equal(withRef(same, 'hdr', 'default', 'old', WR), same);
  });

  it('removes one (every node of that type)', () => {
    const p0 = props();
    const p1 = withRef(p0, 'hdr', 'first', null, WR);
    assert.deepEqual(refsOf({props: p1}, WR), {hdr: {default: 'rIdH1'},
      ftr: {default: 'rIdF1'}});
    assert.equal(p1.extra.length, p0.extra.length - 1);
    const extra = [ref('header', 'even', 'a'), ref('header', 'even', 'b'),
      node('w:headerReference', [['w:type', 'even']])];
    assert.deepEqual(withRef({extra}, 'hdr', 'even', null, WR).extra, []);
    // nothing to remove: the same props
    assert.equal(withRef(p1, 'hdr', 'first', null, WR), p1);
  });

  it('"odd" kept untouched; odd refused as a type', () => {
    const odd = ref('header', 'odd', 'o');
    const extra = [odd, ref('header', 'default', 'd')];
    const p1 = withRef({extra}, 'hdr', 'default', 'n', WR);
    assert.equal(p1.extra[0], odd);
    const p2 = withRef({extra}, 'hdr', 'default', null, WR);
    assert.deepEqual(p2.extra, [odd]);
    const p3 = withRef({extra}, 'hdr', 'first', 'f', WR);
    assert.deepEqual(p3.extra.slice(0, 1), [odd]);
    assert.throws(() => withRef({extra}, 'hdr', 'odd', 'x', WR),
      RangeError);
  });

  it('a new node takes the prefixes the scope binds', () => {
    const m = new Map([['x', 'http://schemas.openxmlformats.org/' +
      'wordprocessingml/2006/main'], ['rel', R_NS]]);
    const n = withRef({extra: []}, 'hdr', 'even', 'e', m).extra[0];
    assert.deepEqual(n, node('x:headerReference', [['x:type', 'even'],
      ['rel:id', 'e']]));
    // no prefix for relationships: one declared on the node
    const m2 = new Map([['w', m.get('x')], ['r', 'urn:taken']]);
    const n2 = withRef({extra: []}, 'ftr', 'first', 'f', m2).extra[0];
    assert.deepEqual(n2, node('w:footerReference', [['w:type', 'first'],
      ['r1:id', 'f'], ['xmlns:r1', R_NS]]));
    assert.deepEqual(refsOf({props: {extra: [n2]}}, m2).ftr,
      {first: 'f'});
  });

  it('refuses bad arguments (RangeError), props unchanged', () => {
    const p0 = props();
    const bad = [['header', 'default', 'x'], ['hdr', 'odd', 'x'],
      ['hdr', '__proto__', 'x'], ['ftr', 'default', ''],
      ['ftr', 'default', 1e9], ['ftr', 'default', undefined],
      ['ftr', 'default', 'a b'], ['ftr', 'default', 'x'.repeat(256)],
      [null, 'default', 'x'], ['hdr', NaN, 'x']];
    for (const [k, t, id] of bad) {
      assert.throws(() => withRef(p0, k, t, id, WR), RangeError,
        JSON.stringify([k, t, id]));
    }
    assert.throws(() => withRef({}, 'hdr', 'default', 'x', WR),
      RangeError);
    assert.throws(() => withRef(null, 'hdr', 'default', 'x', WR),
      RangeError);
  });
});

describe('storyOfRef', () => {
  it('the story a reference reaches', () => {
    assert.equal(storyOfRef(three, 'rIdH1'), H1);
    assert.equal(storyOfRef(three, 'rIdH2'), H2);
    assert.equal(storyOfRef(three, 'rIdF1'), F1);
    assert.equal(storyOfRef(strict, 'rIdH2'), H2);
  });

  it('missing, external, not a story, not a header: null', () => {
    const rels = [...three.rels,
      {id: 'ext', type: REL('header'), target: 'http://x/h.xml',
        mode: 'External', attrs: []},
      {id: 'gone', type: REL('header'), target: 'header9.xml',
        attrs: []},
      {id: 'sty', type: REL('styles'), target: 'header1.xml',
        attrs: []},
      {id: 'up', type: REL('header'), target: '../../h.xml',
        attrs: []}];
    const d = {...three, rels};
    for (const id of ['nope', 'ext', 'gone', 'sty', 'up', '',
      '__proto__', null, 7]) {
      assert.equal(storyOfRef(d, id), null, String(id));
    }
    assert.equal(storyOfRef({...three, stories: undefined}, 'rIdH1'),
      null);
    // a reference whose part is not a story (it stays bytes)
    const st = new Map(three.stories);
    st.delete(H1);
    assert.equal(storyOfRef({...three, stories: st}, 'rIdH1'), null);
  });
});

/** A doc over `three` whose arrays may be changed by ops. */
const fresh = (doc = three) => ({...doc, sections: doc.sections.map(
  (s) => ({...s, blocks: s.blocks.slice()}))});
const newStory = (part, kind, text) => freeze({part, kind,
  root: {name: 'w:' + kind, attrs: []}, prolog: null,
  blocks: [newPara(text)], rels: null, relsPart: null, orig: [],
  bytes: null});

describe('setStory', () => {
  it('adds a story (kept by reference); the inverse removes it', () => {
    const d = fresh();
    const m0 = d.stories;
    const name = freeName(d, 'hdr');
    assert.equal(name, 'word/header3.xml');
    const st = newStory(name, 'hdr', 'new');
    const inv = apply(d, {op: 'setStory', part: name, story: st});
    assert.notEqual(d.stories, m0);
    assert.equal(d.stories.get(name), st, 'not copied');
    assert.deepEqual([...d.stories.keys()], [...m0.keys(), name]);
    assert.deepEqual(inv, {op: 'setStory', part: name, story: null});
    apply(d, inv);
    assert.ok(sameStories(d.stories, three.stories));
  });

  it('replaces a story; the inverse gives the old one back', () => {
    const d = fresh();
    const old = d.stories.get(H1);
    const st = freeze({...old, blocks: [newPara('other')]});
    const inv = apply(d, {op: 'setStory', part: H1, story: st});
    assert.equal(d.stories.get(H1), st);
    assert.deepEqual([...d.stories.keys()], [...three.stories.keys()]);
    assert.equal(inv.story, old, 'the very old Story');
    apply(d, inv);
    assert.ok(sameStories(d.stories, three.stories));
    assert.equal(d.stories.get(H1), old);
  });

  it('removes a story; undo puts it back in its place', () => {
    const d = fresh();
    const keys = [...three.stories.keys()];
    const mid = keys[1];
    const old = d.stories.get(mid);
    const inv = apply(d, {op: 'setStory', part: mid, story: null});
    assert.ok(!d.stories.has(mid));
    assert.deepEqual(inv, {op: 'setStory', part: mid, story: old,
      at: 1});
    const again = apply(d, inv);
    assert.deepEqual([...d.stories.keys()], keys);
    assert.ok(sameStories(d.stories, three.stories));
    apply(d, again);
    assert.ok(!d.stories.has(mid));
  });

  it('refused: RangeError, the doc as it was', () => {
    const d = fresh();
    const m0 = d.stories;
    const h = d.stories.get(H1);
    const body = d.sections[0].blocks[0];
    const cases = [
      {part: H1, story: {...h, part: H2}},          // not its name
      {part: 'word/header3.xml', story: {...h, part: 'word/header3.xml',
        kind: 'sect'}},                              // bad kind
      {part: 'word/header3.xml', story: newStory('word/header3.xml',
        'hdr', 'x'), at: 9},                         // bad place
      {part: 'word/header3.xml', story: {...newStory(
        'word/header3.xml', 'hdr', 'x'), blocks: [body]}}, // id used
      {part: 'word/header3.xml', story: {...h,
        part: 'word/header3.xml'}},                 // H1's ids
      {part: 'word/document.xml', story: newStory(
        'word/document.xml', 'hdr', 'x')},           // another part
      {part: 'word/HEADER1.xml', story: newStory('word/HEADER1.xml',
        'hdr', 'x')},                                // case of H1
      {part: '../h.xml', story: newStory('../h.xml', 'hdr', 'x')},
      {part: 'word/header3.xml', story: null},       // nothing there
      {part: '__proto__', story: null},
      {part: 7, story: null},
      {part: H1, story: 'text'},
      {part: H1, story: undefined},
      {part: H1, story: null, at: 'x'},             // bad at
    ];
    for (const c of cases) {
      assert.throws(() => apply(d, {op: 'setStory', ...c}), RangeError,
        JSON.stringify(c.part));
      assert.equal(d.stories, m0);
    }
    assert.ok(sameStories(d.stories, three.stories));
  });

  it('a doc with no stories Map gets one', () => {
    const d = {...fresh(), stories: undefined};
    const st = newStory('word/header3.xml', 'hdr', 'n');
    apply(d, {op: 'setStory', part: st.part, story: st});
    assert.deepEqual([...d.stories.keys()], [st.part]);
  });
});

/** The document's state, to compare after undo. */
const state = (doc) => ({sections: doc.sections, rels: doc.rels,
  rawSettings: doc.rawSettings, parts: doc.parts, meta: doc.meta});

describe('one d.atomic: setStory + setDocPart rels + setSection', () => {
  let bytes0;
  before(async () => { bytes0 = await write(three); });

  it('a new even-page header, undone to deep-equal', async () => {
    const d = new Document(fresh());
    const before = structuredClone(state(d.doc));
    const map = docScope(d.doc).map;
    d.atomic(() => {
      const doc = d.doc;
      const name = freeName(doc, 'hdr');
      d.apply({op: 'setStory', part: name,
        story: newStory(name, 'hdr', 'Even head')});
      const {rels, id} = addRel(doc.rels, {kind: 'header',
        target: name.slice('word/'.length)});
      d.apply({op: 'setDocPart', key: 'rels', value: rels});
      const s = doc.sections[0];
      d.apply({op: 'setSection', at: 0, raw: s.raw,
        props: withRef(s.props, 'hdr', 'even', id, map)});
    });
    assert.equal(d.undoDepth, 1);
    const out = await write(d.doc);
    const z = await readZip(out);
    assert.deepEqual(errors(z), []);
    const doc = dec(z.get('word/document.xml'));
    assert.match(doc, /<w:headerReference w:type="first" r:id="rIdH2"\/>/);
    assert.ok(doc.indexOf('w:type="even"') < doc.indexOf(
      '<w:footerReference'), 'in schema order');
    const back = await readDocx(out);
    const refs = refsOf(back.sections[0], docScope(back).map);
    const part = storyOfRef(back, refs.hdr.even);
    assert.equal(part, 'word/header3.xml');
    assert.equal(back.stories.get(part).blocks[0].text, 'Even head');

    assert.ok(d.undo());
    assert.ok(deepEqual(state(d.doc), before));
    assert.ok(sameStories(d.doc.stories, three.stories));
    assert.deepEqual(await write(d.doc), bytes0);
    assert.ok(d.redo());
    assert.deepEqual(await write(d.doc), out);
  });

  it('the first-page header removed, undone to deep-equal', async () => {
    const d = new Document(fresh());
    const before = structuredClone(state(d.doc));
    d.atomic(() => {
      const s = d.doc.sections[0];
      const id = refsOf(s, WR).hdr.first;
      d.apply({op: 'setStory', part: storyOfRef(d.doc, id),
        story: null});
      d.apply({op: 'setDocPart', key: 'rels',
        value: d.doc.rels.filter((x) => x.id !== id)});
      d.apply({op: 'setSection', at: 0, raw: s.raw,
        props: withRef(s.props, 'hdr', 'first', null, WR)});
    });
    const z = await readZip(await write(d.doc));
    assert.ok(!z.has(H2));
    assert.deepEqual(errors(z), []);
    assert.ok(d.undo());
    assert.ok(deepEqual(state(d.doc), before));
    assert.ok(sameStories(d.doc.stories, three.stories));
    assert.deepEqual(await write(d.doc), bytes0);
  });

  it('a refused step rolls the whole command back', () => {
    const d = new Document(fresh());
    const m0 = d.doc.stories;
    assert.throws(() => d.atomic(() => {
      d.apply({op: 'setStory', part: 'word/header3.xml',
        story: newStory('word/header3.xml', 'hdr', 'x')});
      d.apply({op: 'setSection', at: 5, props: {extra: []}});
    }), RangeError);
    assert.ok(sameStories(d.doc.stories, m0));
    assert.equal(d.undoDepth, 0);
  });

  it('Strict: a new reference is written Strict', async () => {
    const d = new Document(fresh(strict));
    d.atomic(() => {
      const doc = d.doc;
      const name = freeName(doc, 'ftr');
      d.apply({op: 'setStory', part: name,
        story: newStory(name, 'ftr', 'Strict foot')});
      const {rels, id} = addRel(doc.rels, {kind: 'footer',
        target: name.slice('word/'.length), strict: true});
      d.apply({op: 'setDocPart', key: 'rels', value: rels});
      const s = doc.sections[0];
      d.apply({op: 'setSection', at: 0, raw: s.raw,
        props: withRef(s.props, 'ftr', 'even', id,
          docScope(doc).map)});
    });
    const out = await write(d.doc);
    const xml = dec((await readZip(out)).get('word/document.xml'));
    assert.ok(xml.includes(STRICT_R_NS));
    assert.match(xml, /<w:footerReference w:type="even" r:id="rId\d+"/);
    const back = await readDocx(out);
    const part = storyOfRef(back,
      refsOf(back.sections[0], docScope(back).map).ftr.even);
    assert.equal(back.stories.get(part).blocks[0].text, 'Strict foot');
  });
});

describe('the scope comes from the document (P6 fix I2)', () => {
  it('refsOf and withRef refuse a missing scope (RangeError)', () => {
    const s = three.sections[0];
    for (const m of [undefined, null, {}, 'w']) {
      assert.throws(() => refsOf(s, m), RangeError, String(m));
      assert.throws(() => withRef(s.props, 'hdr', 'even', 'x', m),
        RangeError, String(m));
    }
  });

  it('a root without xmlns:r: r declared on the new reference',
    async () => {
      const d0 = await readDocx(await buildDocx({'word/document.xml':
        DECL + `<w:document xmlns:w="${W_NS}"><w:body>${p(r('b'))}` +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>' +
        '</w:body></w:document>'}));
      assert.ok(!d0.meta.documentRoot.attrs.some(([k]) =>
        k === 'xmlns:r'));
      const d = new Document(d0);
      d.atomic(() => {
        const doc = d.doc;
        const name = freeName(doc, 'hdr');
        d.apply({op: 'setStory', part: name,
          story: newStory(name, 'hdr', 'Head')});
        const {rels, id} = addRel(doc.rels, {kind: 'header',
          target: name.slice('word/'.length)});
        d.apply({op: 'setDocPart', key: 'rels', value: rels});
        const s = doc.sections[0];
        d.apply({op: 'setSection', at: 0, raw: s.raw,
          props: withRef(s.props, 'hdr', 'default', id,
            docScope(doc).map)});
      });
      const {zip, bytes} = await lintAfter(d.doc, 'no xmlns:r');
      const xml = dec(zip.get('word/document.xml'));
      assert.match(xml, new RegExp('<w:headerReference w:type=' +
        '"default" r:id="rId\\d+" xmlns:r="' + R_NS + '"/>'));
      const back = await readDocx(bytes);
      const refs = refsOf(back.sections[0], docScope(back).map);
      assert.equal(back.stories.get(storyOfRef(back, refs.hdr.default))
        .blocks[0].text, 'Head');
    });

  it('q: bound to relationships, r: elsewhere: found and kept',
    async () => {
      const doc = await readDocx(await buildDocx({
        'word/document.xml': DECL + `<w:document xmlns:w="${W_NS}" ` +
          `xmlns:r="urn:other" xmlns:q="${R_NS}"><w:body>` +
          p(r('b')) + '<w:sectPr><w:headerReference w:type="default" ' +
          'q:id="rIdH1"/><w:footerReference w:type="default" ' +
          'q:id="rIdF1"/><w:pgSz w:w="11906" w:h="16838"/>' +
          '</w:sectPr></w:body></w:document>',
        [H1]: hdrXml(p(r('Head'))), [F1]: ftrXml(p(r('Foot')))},
      {docRels: [['rIdH1', REL('header'), 'header1.xml'],
        ['rIdF1', REL('footer'), 'footer1.xml']]}));
      const map = docScope(doc).map;
      const s = doc.sections[0];
      assert.deepEqual(refsOf(s, map), {hdr: {default: 'rIdH1'},
        ftr: {default: 'rIdF1'}});
      const p1 = withRef(s.props, 'hdr', 'first', 'rIdH1', map);
      const n = p1.extra.find((x) => x.attrs.some(([k, v]) =>
        k === 'w:type' && v === 'first'));
      assert.deepEqual(n.attrs, [['w:type', 'first'], ['q:id', 'rIdH1']]);
      assert.deepEqual(refsOf({props: p1}, map).hdr,
        {default: 'rIdH1', first: 'rIdH1'});
      await lintAfter({...doc, sections: [{...s, props: p1}]},
        'q: prefix');
    });
});
