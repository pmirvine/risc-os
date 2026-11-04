// ODT import, task 9: hostile files. Each must read (with notes) or
// be refused with an ImportError, never throw anything else, never
// hang (under 2 s each, MAX_MS) and never hold much memory. The
// inputs are spec-derived fixtures built here (odt-helpers.mjs, from
// OpenDocument 1.3), broken on purpose, and a seeded fuzz of a rich
// one: 300 copies with bytes flipped or the XML of content.xml cut,
// duplicated, reordered, renamed or given huge attribute values.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readOdt} from '../../tools/moreapps/!Letters/OdtRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {MAX_PARAGRAPHS} from '../../tools/moreapps/!Letters/Open';
import {pngBytes} from './pic-fixtures.mjs';
import {makeOdt, storedZip, NS, TEXT} from './odt-helpers.mjs';
import {shape} from './odt-shapes.mjs';

const MAX_MS = 2000;
const DATE = new Date(2024, 4, 6, 7, 8, 10);
const P = (t, extra = '') => `<text:p${extra}>${t}</text:p>`;
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const paras = (doc) => blocks(doc).filter((b) => b.type === 'p');

/** Read bytes: {doc, notes} or {err} (an ImportError); anything
 *  else thrown, or too slow, fails. */
async function attempt(bytes, what, opts = {}) {
  const t0 = Date.now();
  let r;
  try {
    r = await readOdt(bytes, {date: DATE, ...opts});
  } catch (e) {
    assert.equal(e && e.name, 'ImportError', `${what}: ${e && e.stack}`);
    assert.ok(['bad', 'encrypted'].includes(e.code), what);
    r = {err: e};
  }
  const ms = Date.now() - t0;
  assert.ok(ms < MAX_MS, `${what}: ${ms} ms`);
  if (r.doc) {
    assert.ok(!r.notes.some((n) => /could not be read/.test(n)),
      `${what}: ${r.notes.join('; ')}`);
    for (const b of blocks(r.doc)) checkBlock(b);
  }
  return r;
}

const refused = async (bytes, what) => {
  const r = await attempt(bytes, what);
  assert.ok(r.err, what + ': refused');
  return r.err;
};

/** The parts of a built ODT, [name, bytes], in order. */
const partsOf = async (o) => [...(await readZip(makeOdt(o)))];

describe('ODT hostile files', () => {
  it('zip bomb ratio refused', async () => {
    const big = deflateRawSync(Buffer.alloc(40 << 20, 32));
    const parts = await partsOf({content: P('x')});
    // (an honest entry over the 1000:1 ratio: refused from its sizes)
    const zip = storedZip(parts);
    const bomb = bombed(zip, 'content.xml', big, 40 << 20);
    assert.match((await refused(bomb, 'ratio')).message, /too-big|zip/);
    // (an entry that claims less than it unpacks to)
    const liar = bombed(zip, 'content.xml', big, 20000);
    await refused(liar, 'liar');
  });

  it('mimetype not first refused', async () => {
    const [mt, ...rest] = await partsOf({content: P('x')});
    const bare = rest.filter(([n]) => n !== 'META-INF/manifest.xml');
    for (const [z, what] of [
      [storedZip([...bare, mt]), 'last, no manifest'],
      [storedZip([['a', 'b'], ['mimetype', TEXT + 'x'], ...rest]),
        'second, wrong'],
      [storedZip([['mimetype', ''], ...rest]), 'empty'],
      [storedZip([['mimetype', 'x'.repeat(100000)], ...rest]), 'huge'],
      [storedZip([['mimetype', TEXT.toUpperCase()], ...rest]), 'case'],
      [storedZip([['mimetype', TEXT, {deflate: true}], ...bare]),
        'deflated, no manifest'],
      [storedZip([['mimetype', 'application/vnd.oasis.opendocument.' +
        'spreadsheet', {deflate: true}], ...rest]), 'deflated ods'],
    ]) await refused(z, what);
    // (two mimetype entries: the first is the zip's; read)
    await attempt(storedZip([mt, ...rest, ['mimetype', 'x']]), 'two');
  });

  it('truncated zip', async () => {
    const z = makeOdt({content: P('Hello') + P('there'),
      pictures: {'a.png': pngBytes(2, 2)}});
    for (let i = 0; i <= 40; i++) {
      const n = Math.floor(z.length * i / 40);
      await attempt(z.slice(0, n), 'cut at ' + n);
      await attempt(z.slice(z.length - n), 'head cut ' + n);
    }
  });

  it('content.xml missing', async () => {
    const parts = await partsOf({content: P('x')});
    const err = await refused(storedZip(parts.filter(([n]) =>
      n !== 'content.xml').concat([['Content.xml', '<x/>']])), 'none');
    assert.equal(err.code, 'bad');
    await refused(storedZip(parts.map(([n, b]) => [n,
      n === 'content.xml' ? new Uint8Array(0) : b])), 'empty');
    await refused(storedZip(parts.map(([n, b]) => [n,
      n === 'content.xml' ? '<office:document-styles ' + NS + '/>' : b])),
    'not content');
  });

  it('content.xml 64 MB', async () => {
    const pad = '<text:p>' + ' '.repeat((64 << 20) - 100) + '</text:p>';
    const xml = `<office:document-content ${NS}><office:body>` +
      `<office:text>${pad}</office:text></office:body>` +
      '</office:document-content>';
    const err = await refused(makeOdt({content: xml}), '64 MB');
    assert.match(err.message, /more than/);
  });

  it('deep nesting 100000', async () => {
    const deep = (open, close) => P(open.repeat(100000) + 'x' +
      close.repeat(100000));
    for (const [o, c] of [['<text:span>', '</text:span>'],
      ['<text:list><text:list-item>', '</text:list-item></text:list>'],
      ['<text:section>', '</text:section>']]) {
      await refused(makeOdt({content: deep(o, c)}), o);
    }
    // (deep but under the parser's limit: read, with the lists cut)
    const lists = '<text:list><text:list-item>'.repeat(60) + P('d') +
      '</text:list-item></text:list>'.repeat(60);
    const r = await attempt(makeOdt({content: lists}), 'lists 60');
    assert.equal(paras(r.doc)[0].text, 'd');
  });

  it('1,000,000 empty paragraphs hits the cap', async () => {
    // (with the cap !Letters opens documents with: ./Open's)
    const r = await attempt(makeOdt({content: '<text:p/>'.repeat(
      1000000)}), 'million', {maxParagraphs: MAX_PARAGRAPHS});
    assert.ok(paras(r.doc).length <= 200001);
    assert.ok(r.notes.some((n) => /paragraphs: the rest is not read/
      .test(n)), r.notes.join('; '));
  });

  it('a style parent loop', async () => {
    const st = (name, parent) => '<style:style style:name="' + name +
      '" style:family="paragraph"' + (parent ? ' style:parent-style-' +
      `name="${parent}"` : '') + '><style:text-properties fo:font-' +
      'weight="bold"/></style:style>';
    let chain = '';
    for (let i = 0; i < 200; i++) chain += st('C' + i, 'C' + (i + 1));
    const r = await attempt(makeOdt({styles: st('A', 'B') + st('B', 'A') +
      st('S', 'S') + chain, content: P('a', ' text:style-name="A"') +
      P('s', ' text:style-name="S"') + P('c', ' text:style-name="C0"')}),
    'loops');
    assert.deepEqual(paras(r.doc).map((p) => p.text), ['a', 's', 'c']);
    assert.ok(r.notes.some((n) => /based on itself/.test(n)));
    assert.ok(r.notes.some((n) => /chain of styles/.test(n)));
    await writeDocx(r.doc, {date: DATE});
  });

  it('number-columns-repeated overflow', async () => {
    for (const v of ['4294967296', '1e30', '-5', 'NaN', '99999999999',
      '0', '2.5', '0x10']) {
      const t = '<table:table><table:table-column table:number-columns-' +
        `repeated="${v}"/><table:table-row table:number-rows-repeated=` +
        `"${v}"><table:table-cell table:number-columns-repeated="${v}" ` +
        `table:number-columns-spanned="${v}" table:number-rows-spanned=` +
        `"${v}">${P('c')}</table:table-cell></table:table-row>` +
        '</table:table>';
      const r = await attempt(makeOdt({content: t + P('after')}), v);
      assert.equal(paras(r.doc).at(-1).text, 'after', v);
      await writeDocx(r.doc, {date: DATE});
    }
  });

  it('text:s c=-1 / NaN / 1e30', async () => {
    const r = await attempt(makeOdt({content: P(['-1', 'NaN', '1e30',
      '', ' 3', 'Infinity', '9'.repeat(400)].map((c) =>
      `a<text:s text:c="${c}"/>`).join('') + 'b')}), 'spaces');
    // (a count that is not digits is one space, ' 3' three; 400
    // nines: the most)
    assert.equal(paras(r.doc)[0].text, 'a a a a a   a a' +
      ' '.repeat(10000) + 'b');
  });

  it('svg:width garbage', async () => {
    const png = pngBytes(4, 2);
    const frames = ['NaNcm', '-3cm', '1e30in', '', 'cm', '12', '0', 'x'
      .repeat(100000), '3cm3cm', '1.5.5cm'].map((w) =>
      `<draw:frame svg:width="${w}" svg:height="${w}"><draw:image ` +
      'xlink:href="Pictures/a.png"/></draw:frame>').join('');
    const r = await attempt(makeOdt({content: P(frames),
      pictures: {'a.png': png}}), 'widths');
    const n = Object.values(paras(r.doc)[0].inlines).length;
    assert.equal(n, 10);
    await writeDocx(r.doc, {date: DATE});
  });

  it('image href with ../ and absolute paths', async () => {
    const hrefs = ['../a.png', '/etc/passwd', 'file:///etc/passwd',
      'C:\\a.png', '..\\a.png', 'Pictures/../../a.png', '%2e%2e/a.png',
      'Pictures/%2E%2E/%2E%2E/a.png', '//host/a.png', 'http://x/a.png',
      '\u0000', 'Pictures/a.png\u0000.txt'];
    const r = await attempt(makeOdt({content: P(hrefs.map((h) =>
      '<draw:frame svg:width="1cm" svg:height="1cm"><draw:image ' +
      `xlink:href="${h.replaceAll('\u0000', '&#0;')}"/></draw:frame>`)
      .join('') + 'x'), pictures: {'a.png': pngBytes(2, 2)}}),
    'hrefs');
    if (r.doc) {
      assert.equal(Object.values(paras(r.doc)[0].inlines).length, 0);
      assert.ok(r.notes.some((n) => /not inside the file/.test(n)));
    }
  });
});

/** zip with entry `name`'s data replaced by deflated `data` that
 *  claims `size` unpacked bytes (the sizes and CRC patched). */
function bombed(zip, name, data, size) {
  const entries = [];
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.length);
  let at = 0;
  while (dv.getUint32(at, true) === 0x04034b50) {
    const nlen = dv.getUint16(at + 26, true);
    const csize = dv.getUint32(at + 18, true);
    const n = new TextDecoder().decode(zip.subarray(at + 30,
      at + 30 + nlen));
    entries.push([n, zip.subarray(at + 30 + nlen, at + 30 + nlen +
      csize)]);
    at += 30 + nlen + csize;
  }
  // (built by hand: the helper would deflate the 40 MB itself)
  const out = storedZip(entries.map(([n, b]) => [n, n === name
    ? new Uint8Array(1) : b]));
  return patch(out, name, data, size);
}

/** Put data (method 8, `size`) as entry name's data in a stored zip
 *  whose entry name holds one byte. */
function patch(zip, name, data, size) {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.length);
  let at = 0, local = -1;
  while (dv.getUint32(at, true) === 0x04034b50) {
    const nlen = dv.getUint16(at + 26, true);
    const csize = dv.getUint32(at + 18, true);
    const n = new TextDecoder().decode(zip.subarray(at + 30,
      at + 30 + nlen));
    if (n === name) local = at;
    at += 30 + nlen + csize;
  }
  const head = zip.slice(0, local);
  const lh = zip.slice(local, local + 30 + name.length);
  const ldv = new DataView(lh.buffer);
  ldv.setUint16(8, 8, true);
  ldv.setUint32(18, data.length, true);
  ldv.setUint32(22, size, true);
  const rest = zip.slice(local + 30 + name.length + 1);
  const delta = data.length - 1;
  const out = new Uint8Array(head.length + lh.length + data.length +
    rest.length);
  out.set(head, 0);
  out.set(lh, head.length);
  out.set(data, head.length + lh.length);
  out.set(rest, head.length + lh.length + data.length);
  // the central directory: offsets after the entry move by delta
  const o = new DataView(out.buffer);
  const end = out.length - 22;
  const cd = o.getUint32(end + 16, true) + delta;
  o.setUint32(end + 16, cd, true);
  let p = cd;
  for (let k = 0; k < o.getUint16(end + 10, true); k++) {
    const nlen = o.getUint16(p + 28, true);
    const n = new TextDecoder().decode(out.subarray(p + 46,
      p + 46 + nlen));
    const off = o.getUint32(p + 42, true);
    if (off > local) o.setUint32(p + 42, off + delta, true);
    if (n === name) {
      o.setUint16(p + 10, 8, true);
      o.setUint32(p + 20, data.length, true);
      o.setUint32(p + 24, size, true);
    }
    p += 46 + nlen;
  }
  return out;
}

// ------------------------------------------------------------- fuzz

/** A seeded random source (mulberry32). */
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RICH_AUTO = '<style:style style:name="P1" style:family=' +
  '"paragraph" style:parent-style-name="Standard" style:list-style-' +
  'name="L1"><style:paragraph-properties fo:margin-left="1cm"><style:' +
  'tab-stops><style:tab-stop style:position="2cm"/></style:tab-stops>' +
  '</style:paragraph-properties><style:text-properties fo:font-size=' +
  '"14pt" fo:letter-spacing="0.1cm"/></style:style><style:style ' +
  'style:name="T1" style:family="text"><style:text-properties fo:' +
  'font-weight="bold" fo:color="#ff0000"/></style:style>' +
  '<text:list-style style:name="L1"><text:list-level-style-number ' +
  'text:level="1" style:num-format="1" style:num-suffix="."/>' +
  '</text:list-style><style:style style:name="Tb" style:family=' +
  '"table"><style:table-properties style:width="10cm"/></style:style>';
const RICH = '<text:tracked-changes><text:changed-region text:id="d1">' +
  '<text:deletion><office:change-info><dc:creator>A</dc:creator>' +
  '<dc:date>2024-01-01T00:00:00</dc:date></office:change-info>' +
  P('gone') + '</text:deletion></text:changed-region><text:changed-' +
  'region text:id="i1"><text:insertion><office:change-info><dc:creator>' +
  'B</dc:creator><dc:date>2024-01-02T00:00:00</dc:date></office:change-' +
  'info></text:insertion></text:changed-region></text:tracked-changes>' +
  '<text:h text:outline-level="1">Title</text:h>' +
  P('Some <text:span text:style-name="T1">bold</text:span> text<text:s ' +
    'text:c="3"/><text:tab/>and<text:line-break/><text:a xlink:href=' +
    '"http://example.com/">a link</text:a><text:bookmark text:name=' +
    '"b1"/><text:note text:note-class="footnote"><text:note-citation>' +
    '1</text:note-citation><text:note-body>' + P('note') + '</text:note-' +
    'body></text:note><text:change text:change-id="d1"/><text:change-' +
    'start text:change-id="i1"/>new<text:change-end text:change-id="i1"/>' +
    '<office:annotation office:name="c1"><dc:creator>Ann</dc:creator>' +
    P('comment') + '</office:annotation>over<office:annotation-end ' +
    'office:name="c1"/><text:page-number>1</text:page-number>') +
  '<text:list text:style-name="L1"><text:list-item>' + P('one',
    ' text:style-name="P1"') + '<text:list><text:list-item>' + P('one.1') +
  '</text:list-item></text:list></text:list-item><text:list-item>' +
  P('two') + '</text:list-item></text:list>' +
  '<table:table table:style-name="Tb"><table:table-column table:number-' +
  'columns-repeated="2"/><table:table-row><table:table-cell table:' +
  'number-columns-spanned="2">' + P('wide') + '</table:table-cell>' +
  '<table:covered-table-cell/></table:table-row><table:table-row>' +
  '<table:table-cell table:number-rows-spanned="2">' + P('tall') +
  '</table:table-cell><table:table-cell>' + P('b') + '</table:table-' +
  'cell></table:table-row><table:table-row><table:covered-table-cell/>' +
  '<table:table-cell>' + P('c') + '</table:table-cell></table:table-' +
  'row></table:table>' +
  P('pic <draw:frame svg:width="2cm" svg:height="1cm"><draw:image ' +
    'xlink:href="Pictures/a.png"/></draw:frame><draw:frame><draw:text-' +
    'box>' + P('boxed') + '</draw:text-box></draw:frame>') +
  '<text:section text:name="S">' + P('in section') + '</text:section>' +
  '<text:table-of-content text:name="T"><text:index-body>' + P('toc') +
  '</text:index-body></text:table-of-content>';

/** The XML of s as tokens: tags and the text between them. */
const tokens = (s) => s.split(/(<[^>]*>)/).filter((t) => t !== '');

/** The token index of the end of the element starting at token i,
 *  or -1. */
function endOf(toks, i) {
  if (toks[i].endsWith('/>')) return i;
  let depth = 0;
  for (let j = i; j < toks.length; j++) {
    const t = toks[j];
    if (!t.startsWith('<') || t.startsWith('<?')) continue;
    if (t.startsWith('</')) depth--;
    else if (!t.endsWith('/>')) depth++;
    if (depth === 0) return j;
  }
  return -1;
}

const NAMES = ['text:p', 'text:h', 'text:span', 'text:list',
  'text:list-item', 'table:table', 'table:table-row',
  'table:table-cell', 'table:covered-table-cell', 'draw:frame',
  'draw:text-box', 'text:note', 'text:note-body', 'office:annotation',
  'text:section', 'text:a', 'text:tracked-changes', 'text:change',
  'text:change-start', 'text:change-end', 'office:annotation-end',
  'text:changed-region', 'text:deletion', 'draw:g',
  'draw:custom-shape'];
const VALUES = () => ['x'.repeat(200000), '99999999999', '-1', 'NaN',
  '1e30', '', 'c1', 'd1', 'i1', '../../a.png', '#b1', '0'];

/** One XML-level mutation of content.xml's text. */
function mutateXml(rnd, s) {
  const toks = tokens(s);
  const pick = () => Math.floor(rnd() * toks.length);
  // (the start tags after the root's first few, as they are now)
  const starts = () => toks.map((t, i) => t.startsWith('<') &&
    !t.startsWith('</') && !t.startsWith('<?') ? i : -1)
    .filter((i) => i > 2);
  const el = () => {
    const all = starts();
    const i = all[Math.floor(rnd() * all.length)];
    return [i, endOf(toks, i)];
  };
  const kind = Math.floor(rnd() * 7);
  if (kind === 0) toks.splice(pick(), 1); // (breaks the XML: refused)
  else if (kind === 1 || kind === 2 || kind === 3) {
    const [i, j] = el();
    if (j < 0) return toks.join('');
    const part = toks.slice(i, j + 1);
    if (kind === 1) toks.splice(i, j - i + 1); // delete
    else if (kind === 2) toks.splice(j + 1, 0, ...part); // duplicate
    else {
      toks.splice(i, j - i + 1);
      const [k] = el();
      toks.splice(Math.min(k, toks.length), 0, ...part); // move
    }
  } else if (kind === 4) {
    const all = starts();
    const i = all[Math.floor(rnd() * all.length)];
    const vals = VALUES();
    toks[i] = toks[i].replace(/="[^"]*"/, '="' +
      vals[Math.floor(rnd() * vals.length)] + '"');
  } else if (kind === 5) {
    // rename an element (start and end) to another known name
    const [i, j] = el();
    if (j < 0) return toks.join('');
    const to = NAMES[Math.floor(rnd() * NAMES.length)];
    const from = /^<([^\s/>]+)/.exec(toks[i])[1];
    toks[i] = toks[i].replace(from, to);
    if (j !== i) toks[j] = '</' + to + '>';
  } else {
    // wrap an element in another known one
    const [i, j] = el();
    if (j < 0) return toks.join('');
    const to = NAMES[Math.floor(rnd() * NAMES.length)];
    toks.splice(j + 1, 0, '</' + to + '>');
    toks.splice(i, 0, '<' + to + '>');
  }
  return toks.join('');
}

describe('ODT fuzz', () => {
  it('300 mutated copies of a rich ODT read or are refused, quickly',
    async () => {
      const png = pngBytes(4, 2);
      const base = makeOdt({auto: RICH_AUTO, content: RICH,
        pictures: {'a.png': png}});
      const ok = await attempt(base, 'base');
      assert.deepEqual(ok.doc ? [] : [ok.err.message], []);
      assert.ok(paras(ok.doc).length > 5, String(paras(ok.doc).length));
      const parts = [...(await readZip(base))];
      const content = new TextDecoder().decode(parts.find(([n]) =>
        n === 'content.xml')[1]);
      // (ODT_FUZZ_SEED: another seed, to look further by hand)
      const rnd = random(Number(process.env.ODT_FUZZ_SEED) || 20261103);
      const heap0 = process.memoryUsage().heapUsed;
      let read = 0, refusedN = 0, written = 0;
      for (let k = 0; k < 300; k++) {
        let bytes;
        if (k % 3 === 0) {
          // bytes flipped in the zip itself
          bytes = base.slice();
          const n = 1 + Math.floor(rnd() * 20);
          for (let i = 0; i < n; i++) {
            bytes[Math.floor(rnd() * bytes.length)] =
              Math.floor(rnd() * 256);
          }
        } else {
          let s = content;
          const n = 1 + Math.floor(rnd() * 4);
          for (let i = 0; i < n; i++) s = mutateXml(rnd, s);
          bytes = storedZip(parts.map(([nm, b]) => [nm,
            nm === 'content.xml' ? s : b]));
        }
        const r = await attempt(bytes, 'fuzz ' + k);
        if (r.err) {
          refusedN++;
          continue;
        }
        read++;
        const t0 = Date.now();
        await writeDocx(r.doc, {date: DATE});
        assert.ok(Date.now() - t0 < MAX_MS, 'write ' + k);
        written++;
      }
      const grown = process.memoryUsage().heapUsed - heap0;
      console.log(`# odt fuzz: 300 copies, ${read} read (and written), ` +
        `${refusedN} refused; heap grew ${Math.round(grown / 1e6)} MB`);
      assert.equal(written, read);
      assert.ok(read > 100, 'most XML mutations still read');
      assert.ok(grown < 400e6, 'memory bounded');
    });
});

// (final review: content.xml and styles.xml are held at once, so the
// element budget, ./OdtXml MAX_ELEMENTS, is one for the whole file;
// before it was 2,000,000 a part: the shapes below peaked at 1.7 and
// 2.2 GB)
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

describe('ODT: one element budget for the whole file', () => {
  it('the review\'s shapes at their size are refused at once',
    async () => {
      // (mixed: 1,755,000 elements, 2.6 MB packed, read in 5 s and
      // 2.2 GB before; two: 1.7 GB)
      for (const [kind, n] of [['mixed', 135000], ['two', 0]]) {
        const odt = shape(kind, n);
        const t0 = performance.now();
        const e = await readOdt(odt).then(() => null, (x) => x);
        const ms = performance.now() - t0;
        assert.equal(e && e.name, 'ImportError', kind);
        assert.equal(e.message, 'content.xml: more than 1200000 ' +
          'elements', kind);
        assert.ok(ms < 8000, kind + ': ' + ms + ' ms');
      }
    });

  it('the heaviest files under it read within 10 s and 1.2 GB', () => {
    // (a child process each, as openDoc reads them: mixed just under
    // the budget, and 200,000 paragraphs of three styled spans, which
    // must open whole)
    const script = `
      const {shape} = await import(${JSON.stringify(ROOT +
        'tests/moreapps/odt-shapes.mjs')});
      const {openDoc} = await import(${JSON.stringify(ROOT +
        'tools/moreapps/!Letters/Open')});
      const [kind, n, k] = process.argv.slice(1);
      const b = shape(kind, +n, +k);
      const t0 = Date.now();
      const r = await openDoc({readFile: async () => b}, 'x');
      const ms = Date.now() - t0;
      let rss = -1;
      try {
        rss = Math.round(process.resourceUsage().maxRSS / 1024);
      } catch {}
      const ps = r.doc.sections.flatMap((s) => s.blocks).length;
      console.log(JSON.stringify({ms, rss, ps, mb: b.length / 1048576,
        notes: r.notes}));`;
    for (const [kind, n, k] of [['mixed', 78000, 0],
      ['legit', 200000, 3]]) {
      const out = execFileSync(process.execPath, ['--input-type=module',
        '-e', script, kind, String(n), String(k)], {encoding: 'utf8',
        timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'],
        env: {...process.env, NODE_TEST_CONTEXT: ''}});
      const r = JSON.parse(out.trim().split('\n').at(-1));
      console.log(`odthostile: ${kind} (${r.mb.toFixed(1)} MB) read in ` +
        `${r.ms} ms, peak RSS ` + (r.rss > 0 ? r.rss + ' MB' :
        'not reported'));
      assert.ok(r.ms < 10000, kind + ': ' + r.ms + ' ms');
      if (r.rss > 0) assert.ok(r.rss < 1200, kind + ': ' + r.rss + ' MB');
      assert.ok(!r.notes.some((x) => /elements/.test(x)), r.notes);
      if (kind === 'legit') {
        assert.equal(r.ps, 200000);
        assert.deepEqual(r.notes, []);
      }
    }
  });
});
