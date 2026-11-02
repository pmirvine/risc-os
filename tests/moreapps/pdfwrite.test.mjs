import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {num, name, str, hex, PdfWriter}
  from '../../tools/moreapps/!WimpLib/PdfWrite';

const NOW = () => new Date(Date.UTC(2026, 10, 2, 9, 8, 7));
const latin = (b) => Buffer.from(b).toString('latin1');

/** Small reader: checks xref and returns the pieces. */
function read(bytes) {
  const t = latin(bytes);
  const sx = t.lastIndexOf('startxref');
  const xrefAt = Number(/(\d+)/.exec(t.slice(sx + 9))[1]);
  assert.equal(t.slice(xrefAt, xrefAt + 4), 'xref');
  const lines = t.slice(xrefAt).split('\n');
  const size = Number(lines[1].split(' ')[1]);
  const offs = [];
  for (let i = 0; i < size; i++) {
    offs.push(Number(lines[2 + i].slice(0, 10)));
  }
  for (let i = 1; i < size; i++) {
    assert.ok(t.startsWith(i + ' 0 obj', offs[i]), 'object ' + i);
  }
  return {t, size, offs};
}

describe('PdfWrite text helpers', () => {
  it('num', () => {
    assert.equal(num(1e21), '1000000000000000000000');
    assert.equal(num(NaN), '0');
    assert.equal(num(Infinity), '0');
    assert.equal(num(-0), '0');
    assert.equal(num(-0.0001), '0');
    assert.equal(num(0.1 + 0.2), '0.3');
    assert.equal(num(1 / 3), '0.333');
    assert.equal(num(12), '12');
    assert.equal(num(-2.5), '-2.5');
    assert.equal(num(1e-7), '0');
  });
  it('name', () => {
    assert.equal(name('F1'), '/F1');
    assert.equal(name('a b#'), '/a#20b#23');
    assert.equal(name('é'), '/#C3#A9');
  });
  it('str', () => {
    assert.equal(str('abc'), '(abc)');
    assert.equal(str('a)b'), '(a\\)b)');
    assert.equal(str('a\\b('), '(a\\\\b\\()');
    assert.equal(str('é'), '(\xe9)');
    assert.equal(str('€'), '(\xfe\xff\x20\xac)');
    assert.equal(str('(€'), '(\xfe\xff\\000\\(\x20\xac)');
  });
  it('hex', () => {
    assert.equal(hex(new Uint8Array([0, 255, 16])), '<00FF10>');
  });
});

describe('PdfWriter', () => {
  const one = async (opts = {}, content = '0 0 m 10 10 l S') => {
    const w = new PdfWriter({title: 'T', now: NOW, ...opts});
    w.page({w: 595, h: 842.5, content});
    return w.finish();
  };

  it('one page file is well formed', async () => {
    const bytes = await one();
    const {t, size} = read(bytes);
    assert.ok(t.startsWith('%PDF-1.7\n%'));
    assert.ok(bytes[10] > 127 && bytes[11] > 127);
    assert.ok(t.includes('/Size ' + size));
    assert.ok(t.includes('/Count 1'));
    assert.ok(t.includes('/MediaBox [0 0 595 842.5]'));
    assert.ok(t.includes('/CreationDate (D:20261102090807Z)'));
    assert.ok(t.trimEnd().endsWith('%%EOF'));
  });

  it('flate stream decodes to the input', async () => {
    const data = new TextEncoder().encode(
      'q 1 0 0 1 0 0 cm Q\n'.repeat(50));
    const w = new PdfWriter({now: NOW});
    const id = w.stream({Type: '/X'}, data);
    const bytes = await w.finish();
    const {t, offs} = read(bytes);
    assert.ok(t.slice(offs[id]).startsWith(
      id + ' 0 obj\n<< /Type /X /Filter /FlateDecode'));
    const at = t.indexOf('stream\n', offs[id]) + 7;
    const len = Number(/\/Length (\d+)/.exec(t.slice(offs[id]))[1]);
    const z = bytes.subarray(at, at + len);
    assert.equal(latin(bytes.subarray(at + len, at + len + 17)),
      '\nendstream\nendobj');
    const out = new Uint8Array(await new Response(
      new Blob([z]).stream().pipeThrough(
        new DecompressionStream('deflate'))).arrayBuffer());
    assert.deepEqual(out, data);
  });

  it('stored when flate false or no CompressionStream', async () => {
    const saved = globalThis.CompressionStream;
    try {
      globalThis.CompressionStream = undefined;
      const w = new PdfWriter({now: NOW});
      w.stream({}, new Uint8Array([65, 66, 67]));
      const t = latin(await w.finish());
      assert.ok(!t.includes('/Filter'));
      assert.ok(t.includes('/Length 3 >>\nstream\nABC\nendstream'));
    } finally { globalThis.CompressionStream = saved; }
    const w = new PdfWriter({now: NOW});
    w.stream({}, new Uint8Array([65, 66, 67]), {flate: false});
    assert.ok(!latin(await w.finish()).includes('/Filter'));
  });

  it('is deterministic', async () => {
    const a = await one();
    const b = await one();
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, await one({title: 'U'}));
    assert.notDeepEqual(a, await one({}, 'q Q'));
  });

  it('keeps three pages in order, with resources', async () => {
    const w = new PdfWriter({now: NOW});
    const f = w.add('<< /Type /Font /BaseFont /Helvetica >>');
    const ids = [1, 2, 3].map((i) => w.page({
      w: 100, h: 200, content: new Uint8Array([i + 48]),
      fonts: new Map([['F1', f]]), xobjects: new Map([['Im1', f]]),
      gstates: new Map([['G1', f]]), annots: i === 2 ? [f] : []}));
    const {t} = read(await w.finish());
    const kids = ids.map((i) => i + ' 0 R').join(' ');
    assert.ok(t.includes('/Count 3 /Kids [' + kids + ']'));
    assert.ok(t.includes('/Font << /F1 ' + f + ' 0 R >>'));
    assert.ok(t.includes('/XObject << /Im1 '));
    assert.ok(t.includes('/ExtGState << /G1 '));
    assert.equal(t.split('/Annots').length, 2);
  });

  it('reserve and put', async () => {
    const w = new PdfWriter({now: NOW});
    const id = w.reserve();
    w.put(id, '(hi)');
    const t = latin(await w.finish());
    assert.ok(t.includes(id + ' 0 obj\n(hi)\nendobj'));
  });
});
