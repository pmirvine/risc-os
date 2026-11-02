// PdfColour (Batch G1, task 5): CSS colour strings the painters set
// as fillStyle / strokeStyle, read for the PDF context (./PdfSink).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parseColour, rgbOf}
  from '../../tools/moreapps/!WimpLib/PdfColour';

describe('parseColour', () => {
  it('reads #rrggbb and #rgb, any case', () => {
    assert.deepEqual(parseColour('#ff8000'),
      {r: 255, g: 128, b: 0, a: 1});
    assert.deepEqual(parseColour('#FF8000'),
      {r: 255, g: 128, b: 0, a: 1});
    assert.deepEqual(parseColour('#f80'),
      {r: 255, g: 136, b: 0, a: 1});
    assert.deepEqual(parseColour('  #000000 '),
      {r: 0, g: 0, b: 0, a: 1});
  });
  it('reads #rrggbbaa and #rgba', () => {
    assert.deepEqual(parseColour('#ff000080'),
      {r: 255, g: 0, b: 0, a: 128 / 255});
    assert.deepEqual(parseColour('#f008'),
      {r: 255, g: 0, b: 0, a: 136 / 255});
  });
  it('reads rgb() and rgba() with commas or spaces', () => {
    assert.deepEqual(parseColour('rgb(1, 2, 3)'),
      {r: 1, g: 2, b: 3, a: 1});
    assert.deepEqual(parseColour('rgba(255, 255, 255, 0.5)'),
      {r: 255, g: 255, b: 255, a: 0.5});
    assert.deepEqual(parseColour('RGB(10 20 30 / 25%)'),
      {r: 10, g: 20, b: 30, a: 0.25});
    assert.deepEqual(parseColour('rgb(100%, 50%, 0%)'),
      {r: 255, g: 127.5, b: 0, a: 1});
    assert.deepEqual(parseColour('rgba(300, -5, 2.5, 7)'),
      {r: 255, g: 0, b: 2.5, a: 1});
  });
  it('reads the names, transparent with no alpha', () => {
    assert.deepEqual(parseColour('black'), {r: 0, g: 0, b: 0, a: 1});
    assert.deepEqual(parseColour('White'),
      {r: 255, g: 255, b: 255, a: 1});
    assert.equal(parseColour('transparent').a, 0);
    assert.deepEqual(parseColour('grey'), parseColour('gray'));
  });
  it('gives null for what it cannot read', () => {
    for (const s of ['', '#', '#12', '#12345', '#gggggg', 'rgb(1,2)',
      'rgb(1,2,3', 'rgb(a,b,c)', 'rgb(1,2,3,4,5)', 'rgb(1e3,2,3)',
      'rgb(NaN,1,2)', 'hsl(0, 0%, 0%)', 'nocolour', '#0000001',
      'rgb(1,,2,3)', null, undefined, 12, {}]) {
      assert.equal(parseColour(s), null, String(s));
    }
  });
  it('is linear on long input', () => {
    const t = Date.now();
    parseColour('rgb(' + ' '.repeat(1e6) + '1,2,3)');
    parseColour('#' + 'f'.repeat(1e6));
    assert.ok(Date.now() - t < 500);
  });
});

describe('rgbOf', () => {
  it('writes PDF components 0..1', () => {
    assert.equal(rgbOf({r: 255, g: 0, b: 127.5}), '1 0 0.5');
    assert.equal(rgbOf({r: 0, g: 0, b: 0}), '0 0 0');
    assert.equal(rgbOf({r: 1, g: 2, b: 3}), '0.004 0.008 0.012');
  });
});
