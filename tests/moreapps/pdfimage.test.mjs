// PdfImage (Batch G1, task 6): pictures as PDF image XObjects. Raw
// RGBA gets an SMask only when some alpha is not 255; a JPEG goes in
// unchanged as DCTDecode with the component count and Adobe CMYK
// inversion read from its markers; hostile input (0 sizes, wrong
// lengths, truncated or non-JPEG bytes) throws or gives null.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {PdfWriter} from '../../tools/moreapps/!WimpLib/PdfWrite';
import {imageObjects, jpegInfo, MAX_SIDE}
  from '../../tools/moreapps/!WimpLib/PdfImage';
import {jpegBytes, jpegGray} from './pic-fixtures.mjs';

const NOW = () => new Date(Date.UTC(2026, 0, 2, 3, 4, 5));

/** The bytes of object `id` in a finished file, inflated. */
async function streamOf(bytes, id) {
  const t = Buffer.from(bytes).toString('latin1');
  const at = t.indexOf('\n' + id + ' 0 obj\n') + 1;
  const dEnd = t.indexOf('\nstream\n', at);
  const dict = t.slice(at, dEnd);
  const len = Number(/\/Length (\d+)/.exec(dict)[1]);
  const data = bytes.subarray(dEnd + 8, dEnd + 8 + len);
  if (!dict.includes('/FlateDecode')) return {dict, data};
  const out = new Uint8Array(await new Response(new Blob([data])
    .stream().pipeThrough(new DecompressionStream('deflate')))
    .arrayBuffer());
  return {dict, data: out};
}

const rgba = (px) => Uint8Array.from(px.flat());

/** A JPEG with the given start-of-frame and optional Adobe APP14. */
function jpegWith(comps, adobe) {
  const seg = (m, body) => [0xff, m, (body.length + 2) >> 8,
    (body.length + 2) & 255, ...body];
  const sof = [8, 0, 5, 0, 7, comps];
  for (let c = 1; c <= comps; c++) sof.push(c, 0x11, 0);
  const app = adobe === undefined ? [] : seg(0xee,
    [0x41, 0x64, 0x6f, 0x62, 0x65, 0, 100, 0, 0, 0, 0, adobe]);
  return Uint8Array.from([0xff, 0xd8, ...app, ...seg(0xc0, sof),
    ...seg(0xda, [1, 1, 0, 0, 63, 0]), 1, 2, 3, 0xff, 0xd9]);
}

describe('PdfImage: rgba', () => {
  it('opaque pixels give no SMask', async () => {
    const w = new PdfWriter({now: NOW});
    const {id} = imageObjects(w, {width: 2, height: 2, rgba: rgba([
      [1, 2, 3, 255], [4, 5, 6, 255], [7, 8, 9, 255],
      [10, 11, 12, 255]])});
    const out = await w.finish();
    const s = await streamOf(out, id);
    assert.ok(!s.dict.includes('SMask'));
    assert.ok(s.dict.includes('/Width 2'));
    assert.ok(s.dict.includes('/ColorSpace /DeviceRGB'));
    assert.deepEqual([...s.data],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('alpha gives an SMask holding the alpha plane', async () => {
    const w = new PdfWriter({now: NOW});
    const {id} = imageObjects(w, {width: 2, height: 2, rgba: rgba([
      [1, 2, 3, 255], [4, 5, 6, 128], [7, 8, 9, 0],
      [10, 11, 12, 77]])});
    const out = await w.finish();
    const s = await streamOf(out, id);
    const m = /\/SMask (\d+) 0 R/.exec(s.dict);
    assert.ok(m);
    const mask = await streamOf(out, Number(m[1]));
    assert.deepEqual([...mask.data], [255, 128, 0, 77]);
    assert.ok(mask.dict.includes('/DeviceGray'));
    assert.deepEqual([...s.data],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('refuses bad sizes and lengths', () => {
    const w = new PdfWriter();
    const bad = (spec) => assert.throws(() => imageObjects(w, spec),
      /PdfImage/);
    bad({width: 0, height: 0, rgba: new Uint8Array(0)});
    bad({width: 2, height: 2, rgba: new Uint8Array(15)});
    bad({width: 2, height: 2, rgba: new Uint8Array(17)});
    bad({width: 2, height: 2});
    bad({width: 1.5, height: 2, rgba: new Uint8Array(12)});
    bad({width: NaN, height: 1, rgba: new Uint8Array(4)});
    bad({width: -1, height: 1, rgba: new Uint8Array(4)});
    bad({width: MAX_SIDE + 1, height: 1, rgba: new Uint8Array(4)});
    bad({width: 1, height: 1, rgba: [0, 0, 0, 0]});
    bad(null);
    assert.equal(w.objs.length, 4);       // nothing half-added
  });
});

describe('PdfImage: jpeg', () => {
  it('embeds the bytes unchanged with the marker\'s size', async () => {
    const j = jpegBytes(300, 200);
    const w = new PdfWriter({now: NOW});
    const {id} = imageObjects(w, {jpeg: j, width: 300, height: 200});
    const out = await w.finish();
    const s = await streamOf(out, id);
    assert.deepEqual(s.data, j);
    assert.ok(s.dict.includes('/Filter /DCTDecode'));
    assert.ok(!s.dict.includes('FlateDecode'));
    assert.ok(s.dict.includes('/Width 300'));
    assert.ok(s.dict.includes('/Height 200'));
    assert.ok(s.dict.includes('/BitsPerComponent 8'));
  });

  it('reads the size from the file when not given', async () => {
    const w = new PdfWriter({now: NOW});
    const {id} = imageObjects(w, {jpeg: jpegGray(16, 8)});
    const s = await streamOf(await w.finish(), id);
    assert.ok(s.dict.includes('/Width 16'));
    assert.ok(s.dict.includes('/Height 8'));
  });

  it('components 1, 3 and 4 and Adobe CMYK', async () => {
    const cases = [[1, undefined, '/DeviceGray', false],
      [3, undefined, '/DeviceRGB', false],
      [4, undefined, '/DeviceCMYK', false],
      [4, 0, '/DeviceCMYK', true], [4, 2, '/DeviceCMYK', true]];
    for (const [n, adobe, space, inv] of cases) {
      const w = new PdfWriter({now: NOW});
      const {id} = imageObjects(w, {jpeg: jpegWith(n, adobe),
        components: n});
      const s = await streamOf(await w.finish(), id);
      assert.ok(s.dict.includes('/ColorSpace ' + space), s.dict);
      assert.equal(s.dict.includes('/Decode [1 0 1 0 1 0 1 0]'), inv);
      assert.ok(s.dict.includes('/Width 7') &&
        s.dict.includes('/Height 5'));
    }
    const w = new PdfWriter({now: NOW});
    const a = imageObjects(w, {jpeg: jpegWith(4, 2)}).id;
    const b = imageObjects(w, {jpeg: jpegWith(3, 0)}).id;
    const out = await w.finish();
    assert.ok((await streamOf(out, a)).dict
      .includes('/DecodeParms << /ColorTransform 1 >>'));
    assert.ok((await streamOf(out, b)).dict
      .includes('/DecodeParms << /ColorTransform 0 >>'));
  });

  it('jpegInfo reports size, components and the Adobe byte', () => {
    assert.deepEqual(jpegInfo(jpegWith(4, 2)),
      {width: 7, height: 5, components: 4, adobe: 2});
    assert.deepEqual(jpegInfo(jpegWith(3)),
      {width: 7, height: 5, components: 3, adobe: -1});
  });

  it('hostile bytes are refused', () => {
    const good = jpegWith(3);
    const w = new PdfWriter();
    const bad = (jpeg, extra = {}) => {
      if (!Object.keys(extra).length) {
        assert.equal(jpegInfo(jpeg), null);
      }
      assert.throws(() => imageObjects(w, {jpeg, ...extra}),
        /PdfImage/);
    };
    bad(new Uint8Array(0));
    bad(Uint8Array.from([0xff, 0xd8]));
    bad(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]));     // no SOF
    bad(good.subarray(0, 8));                           // truncated
    bad(good.subarray(0, 12));
    bad(new TextEncoder().encode('\x89PNG\r\n\x1a\nxxxxxxxxxxxx'));
    bad(new Uint8Array(100).fill(0xff));
    bad(good, {width: 8});
    bad(good, {components: 1});
    const zero = good.slice();
    zero[zero.indexOf(0xc0) + 5] = 0;
    zero[zero.indexOf(0xc0) + 6] = 0;
    bad(zero);
    const odd = jpegWith(2);
    bad(odd);
    const arith = good.slice();
    arith[arith.indexOf(0xc0)] = 0xc9;
    bad(arith);
    // a SOS before any SOF
    bad(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 2]));
    // every prefix of a good file: null or a full read, never a hang
    for (let n = 0; n <= good.length; n++) {
      const r = jpegInfo(good.subarray(0, n));
      assert.ok(r === null || r.width === 7);
    }
  });
});
