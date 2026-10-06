// The text-input proxy's text cleaning (src/core/textinput.js sanitizeText) in node:
// node --test tests/core/test-textinput-pure.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeText, MAX_TEXT } from '../../src/core/textinput.js';

test('plain text, accents, astral characters pass unchanged', () => {
  assert.deepEqual(sanitizeText('é€😀 a'), { text: 'é€😀 a', truncated: false });
  assert.deepEqual(sanitizeText(''), { text: '', truncated: false });
  assert.deepEqual(sanitizeText(null), { text: '', truncated: false });
});

test('control characters other than \\n and \\t are dropped; CR and CRLF become \\n', () => {
  assert.equal(sanitizeText('a\u0001b\u0007c\td\ne\u007f\u0085f\u009f').text, 'abc\td\nef');
  assert.equal(sanitizeText('x\r\ny\rz').text, 'x\ny\nz');
  assert.equal(sanitizeText('\u0000\u001b').text, '');
});

test('lone surrogates become U+FFFD, pairs are kept', () => {
  assert.equal(sanitizeText('\uD800x').text, '�x');
  assert.equal(sanitizeText('x\uDC00').text, 'x�');
  assert.equal(sanitizeText('\uDC00\uD800').text, '��');
  assert.equal(sanitizeText('😀').text, '😀');
  assert.equal(sanitizeText('\uD83D').text, '�');
});

test('at most MAX_TEXT (100,000) UTF-16 units, flagged truncated, never splitting a pair', () => {
  assert.equal(MAX_TEXT, 100000);
  const r = sanitizeText('x'.repeat(150000));
  assert.equal(r.text.length, 100000);
  assert.equal(r.truncated, true);
  assert.deepEqual(sanitizeText('x'.repeat(100000)), { text: 'x'.repeat(100000), truncated: false });
  const p = sanitizeText('x'.repeat(99999) + '😀😀');
  assert.equal(p.truncated, true);
  assert.equal(p.text, 'x'.repeat(99999));
});
