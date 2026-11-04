// ODT import, final review: work that grew with the square of what a
// file holds. Namespace scopes (./OdtXml) were copied at each element
// that declared one, so many declarations in a part cost declarations
// x elements; open tracked insertions (./OdtRevs) were searched and
// spliced at every mark. Each shape here took seconds to minutes
// before (measured: 43-72 s, 100 s, 17 s) and must now take a small
// part of the time bound, which is generous for a loaded machine.
// The comments and bookmarks shapes were linear already: they guard
// against the same mistake there. Inputs are spec-derived fixtures
// (odt-helpers.mjs, from OpenDocument 1.3), not files from an office
// program.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readOdt} from '../../tools/moreapps/!Letters/OdtRead';
import {parsePart, attr, MAX_NS_ELEMENT, MAX_NS_PART}
  from '../../tools/moreapps/!Letters/OdtXml';
import {MAX_PARAGRAPHS} from '../../tools/moreapps/!Letters/Open';
import {makeOdt, storedZip, NS, TEXT} from './odt-helpers.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const BOUND_MS = 8000;
const enc = (s) => new TextEncoder().encode(s);
const paras = (doc) => doc.sections.flatMap((s) => s.blocks)
  .filter((b) => b.type === 'p');

/** fn's result and how long it took. */
async function timed(fn) {
  const t0 = performance.now();
  const r = await fn();
  return [r, performance.now() - t0];
}

const read = (content, opts = {}) => readOdt(makeOdt({content}),
  {date: DATE, maxParagraphs: MAX_PARAGRAPHS, ...opts});

describe('ODT: namespace scopes cost what they hold', () => {
  it('the review\'s file: 20,000 on the root and one on each of ' +
    '50,000 paragraphs is refused at once', async () => {
    // (0.10 MB packed; 43-72 s to read before)
    let decl = '';
    for (let i = 0; i < 20000; i++) decl += ` xmlns:p${i}="u${i}"`;
    const content = '<?xml version="1.0" encoding="UTF-8"?>' +
      `<office:document-content ${NS}${decl}><office:body>` +
      '<office:text>' + '<text:p xmlns:z="v">x</text:p>'.repeat(50000) +
      '</office:text></office:body></office:document-content>';
    const man = '<?xml version="1.0"?><manifest:manifest xmlns:' +
      'manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">' +
      '</manifest:manifest>';
    const odt = storedZip([['mimetype', TEXT], ['META-INF/manifest.xml',
      man], ['content.xml', content, {deflate: true}]]);
    const [err, ms] = await timed(() => readOdt(odt).then(() => null,
      (e) => e));
    assert.equal(err && err.name, 'ImportError');
    assert.equal(err.message, 'content.xml: more than ' + MAX_NS_ELEMENT +
      ' namespaces declared on one element');
    assert.ok(ms < BOUND_MS, ms + ' ms');
  });

  it('the declarations allowed, nested 250 deep and wide, then 36,000 ' +
    'elements declaring one each, parse in linear time', async () => {
    // (each of the 36,000 copied a 62,500-entry scope before: about
    // 100 s; now a fraction of a second)
    let open = '', close = '';
    for (let d = 0; d < 250; d++) {
      let decl = '';
      for (let k = 0; k < 250; k++) decl += ` xmlns:p${d}_${k}="u${d}_${k}"`;
      open += `<e${decl}>`;
      close = '</e>' + close;
    }
    const text = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
    const s = `<r xmlns:t="${text}">${open}` +
      '<z:a xmlns:z="v" p0_0:k="1" t:x="2"/>'.repeat(36000) +
      `<t:p p249_249:q="3"/>${close}<t:p/><p0_0:b/></r>`;
    const [root, ms] = await timed(() => parsePart(enc(s), 'content.xml'));
    assert.ok(ms < BOUND_MS, ms + ' ms');
    let e = root;
    for (let d = 0; d < 250; d++) e = e.children[0];
    assert.equal(e.children.length, 36001);
    assert.equal(e.children[0].name, '{v}a');
    assert.deepEqual(e.children[0].attrs, [['{u0_0}k', '1'],
      ['text:x', '2']]);
    assert.equal(e.children[36000].name, 'text:p');
    assert.equal(attr(e.children[36000], '{u249_249}q'), '3');
    // (out of the nested scopes the prefixes are unbound again)
    assert.deepEqual(root.children.slice(1).map((c) => c.name),
      ['text:p', '{?p0_0}b']);
  });

  it('an inner declaration hides an outer one until its element ends',
    () => {
      const root = parsePart(enc('<a:r xmlns:a="u1" xmlns="d1">' +
        '<a:x xmlns:a="u2" xmlns=""><a:y/><z/></a:x><a:w/><z/></a:r>'),
      'x');
      const [x, w, z] = root.children;
      assert.equal(root.name, '{u1}r');
      assert.equal(x.name, '{u2}x');
      assert.deepEqual(x.children.map((c) => c.name), ['{u2}y', 'z']);
      assert.equal(w.name, '{u1}w');
      assert.equal(z.name, '{d1}z');
    });

  it('too many declarations on one element, or in a part, are refused',
    () => {
      const on = (n) => {
        let d = '';
        for (let i = 0; i < n; i++) d += ` xmlns:p${i}="u${i}"`;
        return d;
      };
      parsePart(enc(`<r${on(MAX_NS_ELEMENT)}/>`), 'x');
      assert.throws(() => parsePart(enc(`<r${on(MAX_NS_ELEMENT + 1)}/>`),
        'x'), (e) => e.code === 'namespaces' && e.message ===
        'x: more than 256 namespaces declared on one element');
      const many = '<a xmlns:q="u"/>'.repeat(MAX_NS_PART + 1);
      assert.throws(() => parsePart(enc(`<r>${many}</r>`), 'x'),
        (e) => e.code === 'namespaces' && e.message ===
        'x: more than 100000 namespace declarations');
      parsePart(enc(`<r>${many.slice(16)}</r>`), 'x');
    });
});

const REGION = (id, who) => `<text:changed-region text:id="${id}">` +
  '<text:insertion><office:change-info>' +
  `<dc:creator>${who}</dc:creator><dc:date>2024-05-06T07:08:09` +
  '</dc:date></office:change-info></text:insertion></text:changed-region>';
const S = (id) => `<text:change-start text:change-id="${id}"/>`;
const E = (id) => `<text:change-end text:change-id="${id}"/>`;

/** [text, author] of each tagged run of the first paragraph. */
const tagged = (doc) => {
  const p = paras(doc)[0];
  return p.runs.map((r) => [p.text.slice(r.start, r.end),
    r.rev ? r.rev.author : null]);
};

describe('ODT: open tracked insertions cost the same each', () => {
  for (const order of ['in the order started', 'in the reverse order']) {
    it('80,000 insertions all started, then all ended ' + order,
      async () => {
        // (40,000 took 17 s before: 80,000 four times as long)
        const N = 80000;
        let tbl = '', p = '';
        for (let i = 0; i < N; i++) tbl += REGION('c' + i, 'A');
        for (let i = 0; i < N; i++) p += S('c' + i) + 'a';
        for (let i = 0; i < N; i++) {
          p += 'b' + E('c' + (order.includes('reverse') ? N - 1 - i : i));
        }
        const [r, ms] = await timed(() => read('<text:tracked-changes>' +
          tbl + `</text:tracked-changes><text:p>${p}z</text:p>`));
        assert.ok(ms < BOUND_MS, ms + ' ms');
        const runs = tagged(r.doc);
        assert.equal(runs.filter(([, a]) => a === 'A')
          .map(([t]) => t).join(''), 'a'.repeat(N) + 'b'.repeat(N));
        assert.deepEqual(runs.at(-1), ['z', null]);
      });
  }

  it('the innermost open insertion tags the text, as before', async () => {
    const tbl = REGION('c0', 'A0') + REGION('c1', 'A1') +
      REGION('c2', 'A2');
    const r = await read(`<text:tracked-changes>${tbl}` +
      `</text:tracked-changes><text:p>${S('c0')}a${S('c1')}b${S('c2')}` +
      `c${E('c1')}d${E('c2')}e${S('c1')}f${E('c0')}g${E('c1')}h` +
      `${E('c1')}</text:p>`);
    assert.deepEqual(tagged(r.doc), [['a', 'A0'], ['b', 'A1'],
      ['cd', 'A2'], ['e', 'A0'], ['fg', 'A1'], ['h', null]]);
    assert.ok(r.notes.includes('the end of a tracked change with no ' +
      'start is ignored'), r.notes.join('; '));
  });
});

describe('ODT: overlapping comments and bookmarks stay linear', () => {
  it('40,000 comments and 40,000 bookmarks, all started then ended',
    async () => {
      let c = '', b = '';
      for (let i = 0; i < 40000; i++) {
        c += `<office:annotation office:name="c${i}"><text:p>c</text:p>` +
          '</office:annotation>a';
        b += `<text:bookmark-start text:name="b${i}"/>a`;
      }
      for (let i = 0; i < 40000; i++) {
        c += `b<office:annotation-end office:name="c${i}"/>`;
        b += `b<text:bookmark-end text:name="b${i}"/>`;
      }
      const [r, ms] = await timed(() => read(`<text:p>${c}</text:p>` +
        `<text:p>${b}</text:p>`));
      assert.ok(ms < BOUND_MS, ms + ' ms');
      assert.equal(paras(r.doc).length, 2);
    });
});
